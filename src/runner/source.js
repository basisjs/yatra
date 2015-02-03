var getFnInfo = require('./source/info.js');
var sourceUtils = require('./source/utils.js');

var WORKER_COUNT = global.navigator.hardwareConcurrency || 4;
var WORKER_MAX_QUEUE = 25;
var WORKER_SUPPORT = !!global.Worker;
var workerTime;
var workerTaskQueue = [];
var workers = [];
var curWorker = 0;
var workerFlush = false;

var sourceMap = {};
var wrappedSourceMap = {};

/** @cut */ var sentCount = 0;
/** @cut */ var receiveCount = 0;

function createWorkers(){
  var baseURI = basis.config.runnerBaseURI || '';
  var workerScriptUrl = basis.path.resolve(baseURI, asset('./source/worker.js'));
  var workerTime = new Date();

  for (var i = 0; i < WORKER_COUNT; i++)
  {
    var worker = new Worker(workerScriptUrl);

    worker.onmessage = function(event){
      event.data.forEach(function(data){
        wrappedSourceMap[data.body] = data.wrapped;
        sourceMap[data.source].info_ = {
          args: data.args,
          body: data.body
        };
      });

      /** @cut */ if (++receiveCount === sentCount)
      /** @cut */   basis.dev.info('Workers done in ' + (Date.now() - workerTime) + 'ms');
    };

    workers.push(worker);
  }
}

function sendTasksToWorker(){
  /** @cut */ sentCount++;
  workers[curWorker].postMessage(workerTaskQueue);

  workerTaskQueue = [];
  curWorker = (curWorker + 1) % WORKER_COUNT;
}

function flushWorkerTasks(){
  if (workerTaskQueue.length)
    sendTasksToWorker();

  workerFlush = false;
}

function regFunction(fn){
  var source = fn.toString();

  if (source in sourceMap)
    return sourceMap[source];

  sourceMap[source] = fn;

  if (WORKER_SUPPORT)
  {
    // lazy workers init
    if (!workers.length)
      createWorkers();

    if (!workerFlush)
      workerFlush = basis.asap(flushWorkerTasks);

    workerTaskQueue.push({
      source: source,
      breakPointAt: 'none'
    });

    if (workerTaskQueue.length == WORKER_MAX_QUEUE)
      sendTasksToWorker();
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
