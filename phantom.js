var initTime = Date.now();
var page = require('webpage').create();
var secondNum = 1;

function getCounts(){
  return page.evaluate(function(){
    var obj = basis.require('core.runner').count;
    var res = {};
    for (var key in obj)
      res[key] = obj[key].value;
    return res;
  });
};

function progress(){
  var counts = getCounts();
  if (counts.left)
  {
    setTimeout(progress, 1000);

    if (counts.done)
    {
      var done = (100 * counts.done / counts.total).toFixed(2);
      console.log(
        (done.length == 4 ? ' ' + done : done) + '%, ' +
        parseInt(counts.done / ++secondNum, 10) + ' tests/sec'
      );
    }
  }
}

page.viewportSize = { width: 900, height: 600 };
page.onConsoleMessage = function(msg){
  if (/^Start test run/.test(msg))
  {
    console.log(msg);
    console.log(getCounts().total + ' tests');
    progress();
  }
  if (/^Test run done/.test(msg))
  {
    var counts = getCounts();
    console.log('DONE!');
    console.log('Time:', Date.now() - initTime + 'ms');
    if (counts.fault)
    {
      console.log(counts.fault + ' of ' + counts.total + ' failed :(');
      console.log('(see phantom-error-report.png for details)');
      page.render('phantom-error-report.png');
    }
    else
    {
      console.log('Great! No errors!');
    }
    phantom.exit();
  }
};
page.open(
  'http://localhost:8123/test/runner_dev/src/reporter.html?autorun=true&page=/test/index.html',
  function(status){
    console.log('Status: ' + status);
    if (status != 'success')
    {
      console.log('Page not loaded:', status);
      phantom.exit();
    }
  }
);
