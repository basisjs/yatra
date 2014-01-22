require('basis.data');
require('basis.data.dataset');
require('basis.data.index');
require('basis.utils.benchmark');
require('core.test');

var testsToRun = new basis.data.Dataset();

var processingQueue = new basis.data.dataset.Subset({
  source: testsToRun,
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
            item.run();
          });
        });
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

function run(data){
  if (processingQueueTop.itemCount)
  {
    stop();
    basis.nextTick(function(){
      run(data);
    });
    return;
  }

  data.forEach(function(item){
    item.root.reset();
  });

  testsToRun.set(extractTests(data));
}

function stop(){
  testsToRun.remove(testsToRun.getItems().filter(function(item){
    return item.state != basis.data.STATE.PROCESSING;
  }));
}

module.exports = {
  time: time,
  faultTests: faultTests,
  count: {
    total: testCount,
    left: testLeft,
    done: testDone
  },
  run: run,
  stop: stop
};
