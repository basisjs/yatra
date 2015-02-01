var STATE = require('basis.data').STATE;
var Value = require('basis.data').Value;
var DataObject = require('basis.data').Object;
var Dataset = require('basis.data').Dataset;
var Expression = require('basis.data.value').Expression;
var Subset = require('basis.data.dataset').Filter;
var Slice = require('basis.data.dataset').Slice;
var count = require('basis.data.index').count;
var sum = require('basis.data.index').sum;
var getTime = require('basis.utils.benchmark').time;
var TestCase = require('./test.js').TestCase;
var TestSuite = require('./test.js').TestSuite;
var createTest = require('./test.js').create;

var runnerState = new basis.Token('stopped');
var notifier = new basis.Token();
var elapsedTime = new Value({ value: 0 });
var startTime;
var flush = 0;

var testsToRun = new Dataset();
var awaitProcessingTests = new Dataset({
  listen: {
    item: {
      stateChanged: function(item){
        if (item.state != STATE.PROCESSING)
          this.remove(item);
      }
    }
  }
});
var doneTests = new Subset({
  source: testsToRun,
  ruleEvents: 'stateChanged',
  rule: function(test){
    return test.state == STATE.ERROR || test.state == STATE.READY;
  },
  handler: {
    itemsChanged: function(sender, delta){
      if (delta.inserted)
        delta.inserted.forEach(function(test){
          var errors = [];
          var path = [];
          var cursor = test;
          var data = test.state.data instanceof DataObject
            ? test.state.data.data
            : {};

          if (data.error)
          {
            for (var line in data.errorLines)
              errors.push.apply(errors, data.errorLines[line].map(function(error){
                return {
                  line: line,
                  type: error.error,
                  expected: error.expectedStr,
                  actual: error.actualStr
                };
              }));
          }

          while (cursor = cursor.parentNode)
            path.unshift(cursor.data.name);

          notifier.set({
            action: 'report',
            name: test.data.name,
            path: path,
            source: data.testSource,
            success: test.state != STATE.ERROR,
            skipped: data.pending,
            time: data.time,
            exception: data.exception
              ? 'Exception on line ' + data.lastLine + ': ' + data.exception
              : null,
            errors: errors.length ? errors : null
          });
        });
    }
  }
});
var faultTests = new Subset({
  source: doneTests,
  ruleEvents: 'stateChanged',
  rule: function(test){
    return test.state == STATE.ERROR;
  }
});

var processingQueue = new Subset({
  ruleEvents: 'stateChanged',
  rule: function(test){
    return test.state != STATE.READY &&
           test.state != STATE.ERROR;
  }
});
var processingQueueTop = new Slice({
  source: processingQueue,
  rule: 'basisObjectId',
  limit: 1,
  handler: {
    itemsChanged: function(sender, delta){
      if (delta.inserted)
        delta.inserted.forEach(function(item){
          (flush++ % 4 ? basis.asap : basis.nextTick)(function(){
            if (processingQueueTop.has(item))
              item.run();
          });
        });
    }
  }
});

var assertCount = sum(testsToRun, 'stateChanged', function(test){
  if (test.state.data instanceof DataObject)
    return test.state.data.data.testCount;
  return 0;
});
var testCount = count(testsToRun);
var testDoneCount = count(doneTests);
var testFaultCount = count(faultTests);
var testLeft = new Expression(testCount, testDoneCount, function(total, done){
  return total - done;
});

testLeft.addHandler({
  change: function(sender, oldValue){
    if (startTime)
      elapsedTime.set(getTime(startTime));

    if (!this.value && oldValue)
    {
      runnerState.set('stopped');
      notifier.set({
        action: 'finish',
        time: elapsedTime.value
      });
    }
  }
});

function extractTests(data){
  var result = [];

  for (var i = 0, item; item = data[i]; i++)
  {
    if (item instanceof TestCase === false &&
        item instanceof TestSuite === false)
      item = createTest(item);

    var test = item.root;

    if (test instanceof TestCase)
      result.push(test);

    if (test instanceof TestSuite)
      result.push.apply(result, extractTests(test.childNodes));
  }

  return result;
}

function loadTests(data){
  // stop current run
  stop();

  // if data is string use basis.require to fetch data
  if (typeof data == 'string')
    // use IIFE to avoid build warning
    data = (function(require, url){
      return require(url);
    })(basis.require, data);

  // load tests
  testsToRun.set(extractTests(basis.array(data)));
}

function run(){
  // stop previous run
  stop();

  // start
  startTime = getTime();
  runnerState.set('running');
  notifier.set({
    action: 'start',
    testCount: testCount.value
  });

  // if eny test in progress, re-run by timeout
  if (awaitProcessingTests.itemCount)
    return setTimeout(run, 10);

  // reset test state
  testsToRun.forEach(function(item){
    // destroy environment
    var env = item.getEnv();
    if (env)
      env.destroy();
  });

  // add test to processing queue
  processingQueue.setSource(testsToRun);
}

function stop(){
  // if processing queue is not empty
  if (processingQueue.itemCount)
  {
    // save processing tests
    awaitProcessingTests.add(processingQueue.getItems().filter(function(test){
      return test.state == STATE.PROCESSING;
    }));
  }

  // remove all tests from processing queue
  processingQueue.setSource();
}


//
// reg runner settings
//
basis.config.runnerBaseURI = '';

//
// exports
//
module.exports = {
  state: runnerState,
  time: elapsedTime,
  doneTests: doneTests,
  faultTests: faultTests,

  count: {
    assert: assertCount,
    total: testCount,
    left: testLeft,
    done: testDoneCount,
    fault: testFaultCount
  },

  loadTests: loadTests,
  run: run,
  stop: stop,
  subscribe: function(fn, context){
    return notifier.attach(fn, context);
  },
  unsubscribe: function(fn, context){
    return notifier.detach(fn, context);
  },
  on: function(eventName, fn, context){
    notifier.attach(function(event){
      if (event.action == eventName)
        fn.call(context, basis.object.slice(event));
    });
  },

  setup: function(config){
    if (!config)
      return;

    if ('baseURI' in config)
      basis.config.runnerBaseURI = config.baseURI;
  }
};

