require('basis.data');
require('basis.data.dataset');

var processingQueue = new basis.data.Dataset({
  listen: {
    item: {
      stateChanged: function(sender, oldState){
        // processing -> non-processing
        if (oldState == basis.data.STATE.PROCESSING &&
            sender.state != basis.data.STATE.PROCESSING)
          this.remove(sender);
      }
    }
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

function run(tests){
  if (processingQueueTop.itemCount)
  {
    stop();
    basis.nextTick(function(){
      run(tests);
    });
    return;
  }

  tests.forEach(function(item){
    item.reset();
  });

  processingQueue.set(extractTests(tests));
}
function stop(){
  processingQueue.remove(processingQueue.getItems().filter(function(item){
    return item.state != basis.data.STATE.PROCESSING;
  }));
}

module.exports = {
  run: run,
  stop: stop
};
