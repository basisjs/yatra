var getFnInfo = require('./source/info.js');
var sourceUtils = require('./source/utils.js');

var WORKER_COUNT = global.navigator.hardwareConcurrency || 4;
var WORKER_MAX_QUEUE = 20;
var WORKER_SUPPORT = !!global.Worker;
var workerTime = new Date();
var workers = [];
var workerTaskQueue = [];
var curWorker = 0;
var workerFlush = false;

var sourceMap = {};
var wrappedSourceMap = {};

/** @cut */ var sentCount = 0;
/** @cut */ var receiveCount = 0;

function createWorkers(){
  var baseURI = (basis.config.runner || {}).baseURI || '';
  var workerScriptUrl = basis.path.resolve(baseURI, asset('./source/worker.js'));
  for (var i = 0; i < WORKER_COUNT; i++)
  {
    var worker = new Worker(workerScriptUrl);

    worker.onmessage = function(event){
      event.data.forEach(function(data){
        /** @cut */ if (++receiveCount === sentCount)
        /** @cut */   console.log('workers time:', new Date - workerTime);

        wrappedSourceMap[data.body] = data.wrapped;
        sourceMap[data.source].info_ = {
          args: data.args,
          body: data.body
        };
      });
    };

    workers.push(worker);
  }
}

function flushWorkerTasks(){
  var workerQueues = basis.array.create(WORKER_COUNT, function(){
    return [];
  });

  // lazy workers init
  if (!workers.length)
  {
    if (global.Worker)
      createWorkers();
    else
      // Web Workers not supported
      return;
  }

  for (var i = 0, task; task = workerTaskQueue[i]; i++)
  {
    var workerId = i % WORKER_COUNT;
    var workerQueue = workerQueues[workerId];

    if (workerQueue.push(task) == WORKER_MAX_QUEUE)
    {
      /** @cut */ sentCount++;
      workers[workerId].postMessage(workerQueue);
      workerQueues[workerId] = [];
    }
  }

  workerQueues.forEach(function(workerQueue, workerId){
    if (workerQueue.length)
    {
      /** @cut */ sentCount++;
      workers[workerId].postMessage(workerQueue);
    }
  });

  workerTaskQueue = [];
  workerFlush = false;
}

function regFunction(fn){
  var source = fn.toString();

  if (source in sourceMap)
    return sourceMap[source];

  sourceMap[source] = fn;

  if (WORKER_SUPPORT)
  {
    if (!workerFlush)
      workerFlush = basis.asap(flushWorkerTasks);

    workerTaskQueue.push({
      source: source,
      breakPointAt: 'none'
    });
  }

  return fn;
}

function getFunctionInfo(fn){
  if (!fn.info_)
  {
    var fnInfo = getFnInfo(fn.toString());
    fn.info_ = {
      args: fnInfo.args,
      body: fnInfo.body
    };
  }

  return fn.info_;
}

function getWrappedSource(source){
  if (!wrappedSourceMap.hasOwnProperty(source))
    wrappedSourceMap[source] = sourceUtils.wrapSource(source, 'none');

  return wrappedSourceMap[source];
}

module.exports = {
  regFunction: regFunction,
  getFunctionInfo: getFunctionInfo,
  getWrappedSource: getWrappedSource
};
