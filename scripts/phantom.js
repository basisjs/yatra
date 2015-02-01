var pageUrl = 'http://localhost:8123/test/runner_dev/src/runner.html';
var initTime = Date.now();
var page = require('webpage').create();
var secondNum = 1;
var countTotal = 0;
var countDone = 0;
var countFault = 0;

function progress(){
  if (countDone < countTotal)
  {
    setTimeout(progress, 1000);

    if (countDone)
    {
      var done = (100 * countDone / countTotal).toFixed(2);
      console.log(
        (done.length == 4 ? ' ' + done : done) + '%, ' +
        parseInt(countDone / ++secondNum, 10) + ' tests/sec'
      );
    }
  }
}

page.viewportSize = { width: 900, height: 600 };

page.onCallback = function(data){
  if (data)
    switch (data.action){
      case 'start':
        countTotal = data.testCount;
        console.log('Start test running (' + countTotal + ' tests)');
        progress();
        break;

      case 'finish':
        console.log('Test running done in ' + data.time + 'ms (full: ' + (Date.now() - initTime) + 'ms)\n');

        if (countFault)
        {
          console.log(countFault + ' of ' + countTotal + ' failed :\'(');
          //console.log('(see phantom-error-report.png for details)');
          //page.render('phantom-error-report.png');
        }
        else
        {
          console.log('Great! No errors!');
        }

        phantom.exit();
        break;

      case 'report':
        countDone++;
        if (!data.success)
        {
          countFault++;

          // console.warn(data.path.join(' '));
          // if (data.exception)
          //   console.warn('  ' + data.name + ' ' + data.exception + '\n');
          // else
          // {
          //   var sourceLines = data.source.split('\n');
          //   console.warn(data.errors.map(function(error){
          //     return (
          //       '  ' + data.name + ':' + error.line + '\n' +
          //       '    ' + sourceLines[error.line] + '\n' +
          //       '    Expected: ' + error.expected + '\n' +
          //       '    Actual: ' + error.actual
          //     );
          //   }).join('\n') + '\n');
          // }
        }
        break;

      default:
        console.warn('Unknown action from client:', data.action);
    }
};

console.log('Opening test page: ' + pageUrl);
page.open(
  pageUrl,
  function(status){
    if (status != 'success')
    {
      console.log('Page not loaded:', status);
      phantom.exit();
    }

    console.log('Page loaded in ' + (Date.now() - initTime) + 'ms\n');
    page.evaluate(function(){
      (function(){
        if (typeof window.callPhantom === 'function')
        {
          yatra.subscribe(function(event){
            window.callPhantom(event);
          });
        }
        yatra.loadTests('/test/index.js');
        setTimeout(function(){
          yatra.run();
        }, 10);
      })();
    });
  }
);
