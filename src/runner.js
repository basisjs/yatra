require('basis.data');
require('basis.data.dataset');

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

function extractTests(tests){
  var result = [];

  for (var i = 0, test; test = tests[i]; i++)
  {
    if (typeof test.test == 'function')
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
    item.reset();
  });

  testsToRun.set(extractTests(data));
}
function stop(){
  testsToRun.remove(testsToRun.getItems().filter(function(item){
    return item.state != basis.data.STATE.PROCESSING;
  }));
}

module.exports = {
  run: run,
  stop: stop
};
