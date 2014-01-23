require('basis.data');
require('basis.data.dataset');
require('basis.data.index');
require('basis.utils.benchmark');
require('core.test');

var testsToRun = new basis.data.Dataset();
var awaitProcessingTests = new basis.data.Dataset({
  listen: {
    item: {
      stateChanged: function(item){
        if (item.state != basis.data.STATE.PROCESSING)
          this.remove(item);
      }
    }
  }
});
var faultTests = new basis.data.dataset.Subset({
  source: testsToRun,
  ruleEvents: 'stateChanged',
  rule: function(test){
    return test.state == basis.data.STATE.ERROR;
  }
});

var processingQueue = new basis.data.dataset.Subset({
  ruleEvents: 'stateChanged',
  rule: function(test){
    return test.state != basis.data.STATE.READY &&
           test.state != basis.data.STATE.ERROR;
  }
});
var processingQueueTop = new basis.data.dataset.Slice({
  source: processingQueue,
  rule: 'basisObjectId',
  limit: 1,
  handler: {
    itemsChanged: function(sender, delta){
      if (delta.inserted)
        delta.inserted.forEach(function(item){
          basis.nextTick(function(){
            if (processingQueueTop.has(item))
              item.run();
          });
        });
    }
  }
});

var testStartTime;
var time = new basis.data.Value({ value: 0 });
var testCount = basis.data.index.count(testsToRun);
var testLeft = basis.data.index.count(processingQueue);
var testDone = new basis.data.value.Expression(testCount, testLeft, function(total, left){
  return total - left;
});

testLeft.addHandler({
  change: function(sender, oldValue){
    if (this.value && !oldValue)
      testStartTime = basis.utils.benchmark.time();

    time.set(basis.utils.benchmark.time(testStartTime));
  }
});

function extractTests(data){
  var result = [];

  for (var i = 0, item; item = data[i]; i++)
  {
    var test = item.root;

    if (test instanceof core.test.TestCase)
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

function run(data){
  // stop previous run
  stop();

  // if eny test in progress, re-run by timeout
  if (awaitProcessingTests.itemCount)
    return setTimeout(run, 10);

  // reset test state
  testsToRun.forEach(function(item){
    // destroy environment
    var env = item.getEnvRunner();
    if (env)
      env.destroy();

    // reset test state
    item.root.reset();
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
      return test.state == basis.data.STATE.PROCESSING;
    }));
  }

  // remove all tests from processing queue
  processingQueue.setSource();
}

module.exports = {
  time: time,
  faultTests: faultTests,
  count: {
    total: testCount,
    left: testLeft,
    done: testDone
  },

  loadTests: loadTests,
  run: run,
  stop: stop
};
