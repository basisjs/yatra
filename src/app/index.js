var Value = require('basis.data').Value;
var Node = require('basis.ui').Node;

var runner = require('runner');
var rootTest = new Value();
var notifyLoader;

var reporters = {
  'default': resource('./reporters/default/index.js')
};
var reporter = reporters['default'].fetch();


function findTest(test, filename){
  if (test.data.filename_ === filename)
    return test;

  if (test.childNodes)
    for (var i = 0, child; child = test.childNodes[i]; i++)
    {
      var res = findTest(child, filename);
      if (res)
        return res;
    }
}

function loadTests(data, autorun, notifyLoaderFunction){
  if (Array.isArray(data))
    data = { test: data };

  rootTest.set(require('runner.test').create(data));
  reporter.setDelegate(findTest(rootTest.value, location.hash.substr(1)) || rootTest);

  if (typeof notifyLoaderFunction == 'function')
    notifyLoader = notifyLoaderFunction;

  if (autorun)
    setTimeout(function(){
      runner.run();
    }, 100);
}


//
// API
//

var api = {
  notifySupported: new basis.Token(false),
  notifyLoader: function(topic, data){
    if (notifyLoader)
      notifyLoader.call(null, topic, data);
    else
      basis.dev.warn('Notify callback for loader is not defined');
  },
  loadTests: loadTests,
  setup: function(config){
    for (var key in config)
    {
      var value = config[key];
      switch (key)
      {
        case 'element':
          if (typeof value == 'string')
            value = document.getElementById(value);

          basis.nextTick(function(){
            this.appendChild(reporter.element);
          }.bind(value));

          break;

        case 'reporter':
          if (value instanceof Node)
          {
            reporter = value;
            break;
          }

          if (typeof value == 'string')
          {
            if (reporters.hasOwnProperty(value))
            {
              reporter = reporters[value].fetch();
              break;
            }

            basis.dev.warn('Unknown reporter `' + value + '`');
            break;
          }

          basis.dev.warn('Bad value for reporter, should be string or instance of basis.ui.Node');
          break;

        case 'baseURI':
          runner.setup({
            baseURI: value
          });
          break;

        case 'absURI':
          break;
      }
    }
  },
  run: function(){
    runner.run();
  }
};

if (basis.config.exports)
{
  // Library mode: export api to global scope
  global.yatra = api;

  // Try resolve base path to runner static files.
  runner.setup({
    baseURI: basis.path.dirname(basis.array(document.scripts).pop().src || '')
  });
}
else
{
  module.exports = api;

  // App mode
  var params = location.search.replace(/^\?/, '').split('&').reduce(function(res, pair){
    var parts = pair.split('=');
    res[parts.shift()] = parts.join('=');
    return res;
  }, {});

  if (!params.page)
  {
    document.write('Test suite is not specified. Add to page url `?page=path/to/test-suite.html`');
  }
  else
  {
    var testLoader = new Node({
      template: resource('./template/test-loader.tmpl'),
      binding: {
        src: function(){
          return params.page;
        }
      },
      action: {
        ready: function(e){
          var contentWindow = e.sender.contentWindow;

          if (typeof contentWindow.loadTests == 'function')
          {
            /** @cut */ var benchmark = require('basis.utils.benchmark');
            /** @cut */ var testLoadTime = benchmark.time();

            contentWindow.loadTests(function(data, feedback){
              loadTests(data, params.autorun, feedback);
            });

            /** @cut */basis.dev.info('Timing:\n' +
            /** @cut */'  App ready: ' + (new Date - global.startTime) + 'ms\n' +
            /** @cut */'  Test load: ' + benchmark.time(testLoadTime) + 'ms' //+ '\n' + (Date.now() - performance.timing.domLoading)
            /** @cut */);
          }
        }
      }
    });

    basis.doc.body.add(testLoader.element);
  }
  basis.doc.body.add(reporter.element);
}
