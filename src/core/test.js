require('basis.data');
require('basis.data.value');
require('basis.data.index');
require('basis.data.dataset');
require('basis.dom.wrapper');
require('basis.utils.benchmark');

var utils = require('./utils.js');
var envFactory = require('core.env');
var astTools = require('core.ast');

var ERROR_TEST_FAULT = 'ERROR_TEST_FAULT';
var ERROR_EMPTY = 'ERROR_EMPTY';
var ERROR_TEST_CRASH = 'ERROR_TEST_CRASH';
var ERROR_TIMEOUT = 'ERROR_TIMEOUT';

var NOP = function(){};
var testMap = {};

function createTestFactory(data){
  // warn about deprecated properties
  if (data.testcase)
    basis.dev.warn('`testcase` setting is deprecated, use `test` instead');

  // get test itself
  var test = data.test || data.testcase;

  // make a copy of data for safe changes
  data = basis.object.slice(data);
  basis.object.splice(data, ['test', 'testcase']);

  // resolve test content
  if (test)
  {
    if (basis.resource.isResource(data))
      test = test.fetch();
  }
  else
  {
    test = function(){};
  }

  // resolve test instance class
  var Class;
  var config = {
    data: data
  };

  if (typeof test == 'function')
  {
    var fnInfo = utils.getFnInfo(test);

    config.data.async = !!fnInfo.args.length;
    config.data.testArgs = fnInfo.args;
    config.data.testSource = fnInfo.code;

    Class = TestCase;
  }
  else
  {
    config.childNodes = !Array.isArray(test) ? [] : test;

    Class = TestSuite;
  }

  // create instance
  return new Class(config);
}

var FILE_HANDLER = {
  update: function(file, delta){
    if ('content' in delta)
    {
      var exports = basis.resource.extensions['.js'](file.data.content, file.data.filename + '.' + Math.random());
      var config = Array.isArray(exports) ? { test: exports } : exports;
      var newNode = createTestFactory(config);
      this.parentNode.replaceChild(newNode, this);
      this.destroy();
    }
  }
};

var AbstractTest = basis.dom.wrapper.Node.subclass({
  className: 'AbstractTest',

  name: '',
  envRunner: null,

  init: function(){
    basis.dom.wrapper.Node.prototype.init.call(this);

    // if (this.data.filename_ && basis.devtools)
    // {
    //   this.file = basis.devtools.getFile(this.data.filename_, true);
    //   this.file.addHandler(FILE_HANDLER, this);
    // }
  },

  hasOwnEnvironment: function(){
    return Boolean(this.data.init || this.data.html || !this.parentNode);
  },
  getHtml: function(){
    var cursor = this;

    while (!cursor.data.html && cursor.parentNode)
      cursor = cursor.parentNode;

    return cursor.data.html;
  },
  getEnvRunner: function(autocreate){
    if (this.envRunner)
      return this.envRunner;

    var envRunner;

    if (!this.data.init)
      envRunner = this.parentNode && this.parentNode.getEnvRunner(autocreate);

    if ((this.data.init || this.data.html || !envRunner) && autocreate)
    {
      envRunner = envFactory.create(this.data.init, this.getHtml());
      envRunner.addHandler({
        destroy: function(){
          this.envRunner = null;
          this.reset();
        }
      }, this);
      this.envRunner = envRunner;
    }

    return envRunner;
  },
  reset: function(){
    if (this.envRunner)
    {
      this.envRunner.destroy();
      this.envRunner = null;
    }
  },

  destroy: function(){
    basis.dom.wrapper.Node.prototype.destroy.call(this);

    if (this.envRunner)
    {
      this.envRunner.destroy();
      this.envRunner = null;
    }

    if (this.file)
    {
      this.file.removeHandler(FILE_HANDLER, this);
      this.file = null;
    }
  }
});

var TestCase = AbstractTest.subclass({
  className: 'TestCase',

  name: '',
  testSource: null,
  testWrappedSources: null,

  childClass: null,

  getSourceCode: function(breakpointAt){
    if (this.testWrappedSources === null)
    {
      this.testWrappedSources = {};
    }

    if (typeof breakpointAt != 'number')
      breakpointAt = 'none';

    if (!this.testWrappedSources[breakpointAt])
    {
      var ast = astTools.parse(this.data.testSource);

      if (breakpointAt == 'none')
      {
        astTools.traverseAst(ast, function(node){
          if (node.parentNode && (node.parentNode.type == 'BlockStatement' || node.parentNode.type == 'Program'))
          {
            var firstToken = astTools.getNodeRangeTokens(node)[0];
            firstToken.value = '__enterLine(' + (firstToken.loc.start.line - 1) + ');' + firstToken.value;
          }

          if (node.type == 'CallExpression' &&
              node.callee.type == 'MemberExpression' &&
              node.callee.object.type == 'ThisExpression' &&
              node.callee.computed == false &&
              node.callee.property.type == 'Identifier' &&
              node.callee.property.name == 'is')
          {
            var token = astTools.getNodeRangeTokens(node)[0];
            token.value = '__isFor([' + node.range + '], ' + (node.loc.end.line - 1) + ') || ' + token.value;
          }

          if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration')
          {
            var tokens = astTools.getNodeRangeTokens(node.body);
            tokens[0].value +=
              '\ntry {\n';
            tokens[1].value =
              '\n} catch(e) {' +
                '__exception(e);' +
                'throw e;' +
              '}\n' + tokens[1].value;
          }
        });
      }

      var wrapperSource = astTools.translateAst(ast, 0, ast.source.length);
      this.testWrappedSources[breakpointAt] =
        'function(' + this.data.testArgs.concat('__isFor', '__enterLine', '__exception').join(', ') + '){\n' +
          wrapperSource +
        '\n}';
      //console.log(wrapperSource);
    }

    return this.testWrappedSources[breakpointAt];
  },

  reset: function(){
    AbstractTest.prototype.reset.call(this);
    this.setState(basis.data.STATE.UNDEFINED);
  },
  run: function(){
    // var _warn = basis.dev.warn;
    // var _error = basis.dev.error;
    var warnMessages = [];
    var errorMessages = [];
    var error;
    var time = NaN;
    var startTime;
    var timeoutTimer;
    var async = this.data.async ? 1 : 0;
    var isNode = null;

    var report = {
      test: null,
      testSource: this.data.testSource,
      time: time,
      lastLine: 0,

      pending: false,
      successCount: 0,
      testCount: 0,

      error: null,
      exception: null,
      errorLines: {},
      warns: null
    };

    var env = {
      async: function(fn){
        async++;
        basis.nextTick(function(){
          if (async > 0)
          {
            try {
              fn.call(this);
            } catch(e) {
              __exception(e);
            } finally {
              if (async > 0)
              {
                if (!--async)
                  testDone();
              }
            }
          }
        }.bind(this));
      },
      is: function(expected, actual){
        var error = utils.compareValues(expected, actual);

        if (error)
        {
          if (isNode)
          {
            var line = isNode.line;
            var errors = report.errorLines[line];

            if (!errors)
              errors = report.errorLines[line] = [];

            errors.push({
              num: report.testCount,
              node: isNode,
              error: error,
              expected: utils.makeStaticCopy(expected),
              expectedStr: utils.value2string(expected),
              actual: utils.makeStaticCopy(actual),
              actualStr: utils.value2string(actual)
            });
          }
        }
        else
          report.successCount++;

        report.testCount++;
      },
      report: report
    };

    var __isFor = function(range, line){
      report.lastLine = line
      isNode = {
        range: range,
        line: line
      };
    };

    var __enterLine = function(line){
      report.lastLine = line
    };

    var __exception = function(e){
      if (report.exception)
        return;

      report.exception = e;
      report.testCount = 0;
      report.successCount = 0;

      testDone(ERROR_TEST_CRASH);
    };

    var asyncDone = async
      ? basis.fn.runOnce(function(){
          if (async > 0)
            async--;

          if (!async)
            testDone();
        })
      : NOP;

    var testDone = function(error){
      time = basis.utils.benchmark.time(startTime);
      timeoutTimer = clearTimeout(timeoutTimer);
      async = 0;

      if (!error && report.testCount != report.successCount)
        error = ERROR_TEST_FAULT;

      basis.object.extend(report, {
        test: this,
        time: time,
        error: error,
        pending: !error && !report.testCount,
        warns: warnMessages.length ? warnMessages : null
      });

      this.setState(
        error || errorMessages.length
          ? basis.data.STATE.ERROR
          : basis.data.STATE.READY,
        new basis.data.Object({
          data: report
        })
      );
    }.bind(this);

    // set processing state
    this.setState(basis.data.STATE.PROCESSING);

    if (this.data.pending)
      return testDone();

    // prepare env and run test
    this.getEnvRunner(true).run(
      this.getSourceCode(),
      this,
      function(testFn){
        startTime = basis.utils.benchmark.time();

        // prepare args
        var args = basis.array.create(this.data.testArgs.length);
        if (args.length)
          args[0] = asyncDone;
        args.push(__isFor, __enterLine, __exception);

        // run test
        try {
          testFn.apply(env, args);
        } catch(e) {
          return __exception(e);
        }

        // if test is
        if (!async)
          // if test is not async - task done
          testDone();
        else
          // if test is async - set timeout
          timeoutTimer = setTimeout(function(){
            testDone(ERROR_TIMEOUT);
          }, this.data.timeout || 250);
      }
    );
  }
});


var TestSuite = AbstractTest.subclass({
  className: 'TestSuite',

  childFactory: createTestFactory,
  childClass: AbstractTest,

  init: function(){
    AbstractTest.prototype.init.call(this);

    this.nestedTests_ = new basis.data.Dataset({
      items: this.childNodes.reduce(function(res, item){
        return res.concat(
          item instanceof TestSuite
            ? item.nestedTests_.getItems()
            : item
        );
      }, [])
    });
    this.testByState_ = new basis.data.dataset.Split({
      source: this.nestedTests_,
      ruleEvents: 'stateChanged',
      rule: function(test){
        return test.state == basis.data.STATE.READY && test.state.data.data.pending
          ? 'pending'
          : String(test.state);
      }
    });

    this.state_ = new basis.data.value.Expression(
      basis.data.Value.from(this.nestedTests_, 'itemsChanged', 'itemCount'),
      basis.data.Value.from(this.testByState_.getSubset('processing', true), 'itemsChanged', 'itemCount'),
      basis.data.Value.from(this.testByState_.getSubset('error', true), 'itemsChanged', 'itemCount'),
      basis.data.Value.from(this.testByState_.getSubset('ready', true), 'itemsChanged', 'itemCount'),
      basis.data.Value.from(this.testByState_.getSubset('pending', true), 'itemsChanged', 'itemCount'),
      function(count, processing, error, ready, pending){
        if (!count)
          return [
            basis.data.STATE.READY,
            new basis.data.Object({
              data: {
                pending: true,
                testCount: count,
                successCount: ready
              }
            })
          ];

        if (processing + error + ready + pending == 0)
          return [basis.data.STATE.UNDEFINED];

        if (processing || error + ready + pending < count)
          return [
            basis.data.STATE.PROCESSING,
            (error + ready) / count
          ];

        return [
          error ? basis.data.STATE.ERROR : basis.data.STATE.READY,
          new basis.data.Object({
            data: {
              pending: pending == count,
              error: error ? ERROR_TEST_FAULT : null,
              testCount: count,
              successCount: ready
            }
          })
        ];
      }
    );
    // TODO: remove when basis.data.value.Expression#lock/unlock will be fixed
    this.state_.changeWatcher = this.state_.handler.handler.context.value;
    this.state_.link(this, function(state){
      this.setState.apply(this, state);
    });
  },

  reset: function(){
    AbstractTest.prototype.reset.call(this);
    this.state_.lock();
    this.childNodes.forEach(function(test){
      test.reset();
    });
    this.state_.unlock();
    this.state_.changeWatcher.update();  // TODO: remove when basis.data.value.Expression#lock/unlock will be fixed
  },

  destroy: function(){
    this.testByState_.destroy()
    this.testByState_ = null;
    this.nestedTests_.destroy();
    this.nestedTests_ = null;
    this.state_.destroy();
    this.state_ = null;

    AbstractTest.prototype.destroy.call(this);
  }
});


module.exports = {
  AbstractTest: AbstractTest,
  TestCase: TestCase,
  TestSuite: TestSuite,

  map: testMap,
  create: createTestFactory
};
