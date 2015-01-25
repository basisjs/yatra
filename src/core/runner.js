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
var TestCase = require('core.test').TestCase;
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
var faultTests = new Subset({
  source: testsToRun,
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
          (flush++ % 8 ? basis.asap : basis.nextTick)(function(){
            if (processingQueueTop.has(item))
              item.run();
          });
        });
    }
  }
});

var testStartTime;
var time = new Value({ value: 0 });
var assertCount = sum(testsToRun, 'stateChanged', function(test){
  if (test.state.data instanceof DataObject)
    return test.state.data.data.testCount;
  return 0;
});
var testCount = Value.from(testsToRun, 'itemsChanged', 'itemCount');
var testDone = count(testsToRun, 'stateChanged', function(test){
  return test.state == STATE.ERROR || test.state == STATE.READY;
});
var testLeft = new Expression(testCount, testDone, function(total, done){
  return total - done;
});

testLeft.addHandler({
  change: function(sender, oldValue){
    if (this.value && !oldValue)
      testStartTime = getTime();

    time.set(getTime(testStartTime));

    if (!this.value)
      basis.dev.log('Test run done in', getTime(testStartTime));
  }
});

function extractTests(data){
  var result = [];

  for (var i = 0, item; item = data[i]; i++)
  {
    var test = item.root;

    if (test instanceof TestCase)
      result.push(test);

    if (test.firstChild)
      result.push.apply(result, extractTests(test.childNodes));
  }

  return result;
}

function loadTests(data){
  // stop current run
  stop();

  // load tests
  testsToRun.set(extractTests(data));
}

function run(){
  // stop previous run
  stop();

  // start
  basis.dev.log('Start test running', testsToRun);
  testStartTime = getTime();

  // if eny test in progress, re-run by timeout
  if (awaitProcessingTests.itemCount)
    return setTimeout(run, 10);

  // reset test state
  testsToRun.forEach(function(item){
    // destroy environment
    var env = item.getEnvRunner();
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

module.exports = {
  time: time,
  faultTests: faultTests,

  count: {
    assert: assertCount,
    total: testCount,
    left: testLeft,
    done: testDone,
    fault: count(faultTests)
  },

  loadTests: loadTests,
  run: run,
  stop: stop
};
