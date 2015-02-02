var STATE = require('basis.data').STATE;
var Value = require('basis.data').Value;
var DataObject = require('basis.data').Object;
var Dataset = require('basis.data').Dataset;
var Expression = require('basis.data.value').Expression;
var Split = require('basis.data.dataset').Split;
var Extract = require('basis.data.dataset').Extract;
var DomWrapperNode = require('basis.dom.wrapper').Node;
var getTime = require('basis.utils.benchmark').time;

var utils = require('./utils.js');
var envFactory = require('./env.js');
var sourceUtils = require('./source.js');

var ERROR_TEST_FAULT = 'ERROR_TEST_FAULT';
var ERROR_EMPTY = 'ERROR_EMPTY';
var ERROR_TEST_CRASH = 'ERROR_TEST_CRASH';
var ERROR_TIMEOUT = 'ERROR_TIMEOUT';

var NOP = function(){};

function createTestFactory(data){
  // warn about deprecated properties
  if (data.testcase)
    basis.dev.warn('`testcase` setting is deprecated, use `test` instead');

  // get test itself
  var test = data.test || data.testcase;
  var host = this && this instanceof TestSuite ? this : {};

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

  // fallback name
  if (!data.name)
    data.name = typeof test == 'function' ? 'Untitled test' : 'Untitled test suite';

  // resolve test instance class
  var Class;
  var config = {
    data: data
  };

  config.beforeEach = basis.array(host.beforeEach);
  if (typeof data.beforeEach == 'function')
    config.beforeEach.push(sourceUtils.regFunction(data.beforeEach));

  config.afterEach = basis.array(host.afterEach);
  if (typeof data.afterEach == 'function')
    config.afterEach.unshift(sourceUtils.regFunction(data.afterEach));

  if (typeof test == 'function')
  {
    config.data.type = 'case';
    config.data.async = test.length > 0;
    config.data.test = sourceUtils.regFunction(test);

    // var fnInfo = utils.getFnInfo(test);
    //   config.args = fnInfo.args;
    //   config.source = fnInfo.code;

    Class = TestCase;
  }
  else
  {
    config.data.type = 'suite';
    config.childNodes = !Array.isArray(test) ? [] : test;

    Class = TestSuite;
  }

  // create instance
  return new Class(config);
}

var AbstractTest = DomWrapperNode.subclass({
  className: 'AbstractTest',

  name: '',
  env: null,
  scope: null,

  hasOwnEnvironment: function(){
    return Boolean(this.data.init || this.data.html || !this.parentNode);
  },
  getHtml: function(){
    var cursor = this;

    while (!cursor.data.html && cursor.parentNode)
      cursor = cursor.parentNode;

    return cursor.data.html;
  },
  getEnv: function(autocreate){
    if (this.env)
      return this.env;
  },
  getScope: function(autocreate){
    if (this.scope)
      return this.scope;

    if (!this.data.html && !this.data.init)
    {
      // try to get scope from ancestors
      var cursor = this;
      var scope;
      while (cursor = cursor.parentNode)
      {
        var scope = cursor.getScope(autocreate);
        if (scope)
        {
          this.scope = scope;
          this.env = scope.env;
          return scope;
        }
      }
    }

    if (autocreate)
    {
      this.env = envFactory.get(this.getHtml(), this.data.init && !this.data.sandbox);
      this.scope = this.env.createScope(this.data.init);

      this.env.addHandler({
        destroy: function(){
          this.env = null;
          this.scope = null;
          this.reset();
        }
      }, this);
    }

    return this.scope;
  },
  reset: function(){
    if (this.env)
    {
      this.env.destroy();
      this.env = null;
      this.scope = null;
    }
  },

  destroy: function(){
    DomWrapperNode.prototype.destroy.call(this);

    if (this.env)
    {
      this.env.destroy();
      this.env = null;
      this.scope = null;
    }
  }
});

var TestCase = AbstractTest.subclass({
  className: 'TestCase',

  name: '',
  testSource: null,
  testWrappedSources: null,
  beforeEach: null,
  afterEach: null,

  childClass: null,

  emit_update: function(delta){
    AbstractTest.prototype.init.call(this, delta);
    if ('test' in delta)
    {
      this.testSource = null;
      this.testWrappedSources = null;
      this.beforeAfterInfo = null;
    }
  },
  getSourceCode: function(){
    if (this.testSource != null)
      return this.testSource;

    var before = this.beforeEach.map(function(fn){
      return sourceUtils.getFunctionInfo(fn).body;
    });
    var after = this.afterEach.map(function(fn){
      return sourceUtils.getFunctionInfo(fn).body;
    });
    var beforeLines = 0;
    var beforeCount = 0;
    var afterLines = 0;
    var afterCount = 0;
    var fnInfo = sourceUtils.getFunctionInfo(this.data.test);
    var source = fnInfo.body;

    if (before.length)
    {
      beforeCount = before.length;
      before = before.join('\n') +
        '\n// ----- before each end\n\n';
      beforeLines = before.match(/\n/g).length;
      source = before + source;
    }

    if (after.length)
    {
      afterCount = after.length;
      after = '\n\n// ----- after each start\n' +
        after.join('\n');
      afterLines = after.match(/\n/g).length;
      source += after;
    }

    this.testSource = source;
    this.beforeAfterInfo = {
      beforeLines: beforeLines,
      beforeCount: beforeCount,
      afterLines: afterLines,
      afterCount: afterCount
    };

    return source;
  },
  getWrappedSourceCode: function(breakpointAt){
    var source = this.getSourceCode();

    if (typeof breakpointAt != 'number')
      breakpointAt = 'none';

    if (this.testWrappedSources === null)
      this.testWrappedSources = {};

    if (!this.testWrappedSources[breakpointAt])
    {
      var sourceMap = '';
        // '\n//# sourceMappingURL=data:application/json;base64,' +
        // require('basis.utils.base64').encode('{"version":3,"sources":["' + basis.path.origin + '/foo.js' + '"],"sourcesContent":[' + JSON.stringify(source) + '],' +
        // '"mappings":"AAAA' + basis.string.repeat(';AACA', source.split('\n').length) +
        // '"}', true) + '\n';

      this.testWrappedSources[breakpointAt] =
        'function(' + sourceUtils.getFunctionInfo(this.data.test).args.concat('assert', '__isFor', '__enterLine', '__exception', '__wrapFunctionExpression', '__actual', '__expected').join(', ') + '){\n' +
          sourceUtils.getWrappedSource(source, breakpointAt) +
        '\n}' + sourceMap;
    }

    return this.testWrappedSources[breakpointAt];
  },
  getBeforeAfterInfo: function(){
    if (!this.beforeAfterInfo)
      this.getSourceCode();

    return this.beforeAfterInfo;
  },

  reset: function(){
    AbstractTest.prototype.reset.call(this);
    this.setState(STATE.UNDEFINED);
  },
  run: function(breakAssert){
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
    var isForNum = 0;
    var sourceCode = this.getSourceCode();
    var beforeAfterInfo = this.getBeforeAfterInfo();

    var implicitCompare;
    var actual_;
    var expected_;

    var report = {
      test: null,
      beforeLines: beforeAfterInfo.beforeLines,
      beforeCount: beforeAfterInfo.beforeCount,
      testSource: sourceCode,
      afterLines: beforeAfterInfo.afterLines,
      afterCount: beforeAfterInfo.afterCount,
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
        setTimeout(function(){
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
        }.bind(this), 4);
      },
      is: function(expected, actual, deep){
        var error;

        if (arguments.length == 1)
        {
          error = utils.isTruthy(expected);
          if (implicitCompare)
          {
            actual = actual_;
            expected = expected_;
          }
          else
          {
            actual = expected;
            expected = true;
          }
        }
        else
        {
          error = utils.compareValues(expected, actual, deep);
        }

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
              debug: isForNum,
              node: isNode,
              error: error,
              expected: utils.makeStaticCopy(expected),
              expectedStr: utils.value2string(expected, false, deep),
              actual: utils.makeStaticCopy(actual),
              actualStr: utils.value2string(actual, false, deep)
            });
          }
        }

        implicitCompare = false;
        actual_ = undefined;
        expected_ = undefined;

        report.successCount += !error;
        report.testCount++;
      },
      report: report
    };

    var __actual = function(operator, value){
      implicitCompare = operator;
      actual_ = value;
      return value;
    };
    var __expected = function(value){
      expected_ = value;
      return value;
    };

    var __isFor = function(start, end, line){
      report.lastLine = line;
      isNode = {
        range: [start, end],
        line: line
      };
      return ++isForNum === breakAssert;
    };

    var __enterLine = function(line){
      report.lastLine = line;
    };

    var __wrapFunctionExpression = function(fn, orig){
      var wrappedFn = function(){
        try {
          return fn.apply(this, arguments);
        } catch(e) {
          __exception(e);
          throw e;
        }
      };
      wrappedFn.originalFn_ = orig;
      return wrappedFn;
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
      time = getTime(startTime);
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
        error || errorMessages.length ? STATE.ERROR : STATE.READY,
        new DataObject({
          data: report
        })
      );
    }.bind(this);

    // set processing state
    this.setState(STATE.PROCESSING);

    if (this.data.pending)
      return testDone();

    // prepare env and run test
    this.getScope(true).run(
      this.getWrappedSourceCode(),
      this,
      function(testFn){
        startTime = getTime();

        var assert = env.is.bind(env);
        assert.exception =
        assert['throws'] = function(fn){
          try {
            report.exception = true;
            fn();
            assert(false);
          } catch(e) {
            assert(true);
          } finally {
            report.exception = false;
          }
        };
        assert.deep = function(expected, actual){
          //debugger;
          assert(expected, actual, true);
        };

        // prepare args
        var args = new Array(sourceUtils.getFunctionInfo(this.data.test).args.length);
        if (args.length)
          args[0] = asyncDone;
        args.push(assert,
          __isFor,
          __enterLine,
          __exception,
          __wrapFunctionExpression,
          __actual,
          __expected
        );

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

    // good solution, but requires for excludeSourceItems
    // this.nestedTests_ = new Extract({
    //   source: this.getChildNodesDataset(),
    //   excludeSourceItems: true,
    //   rule: function(item){
    //     return item instanceof TestSuite ? item.nestedTests_ : item;
    //   }
    // });

    this.nestedTests_ = new Dataset({
      items: this.childNodes.reduce(function(res, item){
        return res.concat(
          item instanceof TestSuite
            ? item.nestedTests_.getItems()
            : item
        );
      }, [])
    });

    // replace for Vector
    this.testByState_ = new Split({
      source: this.nestedTests_,
      ruleEvents: 'stateChanged',
      rule: function(test){
        return test.state == STATE.READY && test.state.data.data.pending
          ? 'pending'
          : String(test.state);
      }
    });

    this.state_ = new Expression(
      Value.from(this.nestedTests_, 'itemsChanged', 'itemCount'),
      Value.from(this.testByState_.getSubset('processing', true), 'itemsChanged', 'itemCount'),
      Value.from(this.testByState_.getSubset('error', true), 'itemsChanged', 'itemCount'),
      Value.from(this.testByState_.getSubset('ready', true), 'itemsChanged', 'itemCount'),
      Value.from(this.testByState_.getSubset('pending', true), 'itemsChanged', 'itemCount'),
      function(count, processing, error, ready, pending){
        if (!count)
          return [
            STATE.READY,
            new DataObject({
              data: {
                pending: true,
                testCount: count,
                successCount: ready
              }
            })
          ];

        if (processing + error + ready + pending == 0)
          return [STATE.UNDEFINED];

        if (processing || error + ready + pending < count)
          return [
            STATE.PROCESSING,
            (error + ready) / count
          ];

        return [
          error ? STATE.ERROR : STATE.READY,
          new DataObject({
            data: {
              pending: pending == count,
              error: error ? ERROR_TEST_FAULT : null,
              testCount: count,
              successCount: ready + pending
            }
          })
        ];
      }
    );

    this.state_.link(this, function(state){
      this.setState.apply(this, state);
    });
  },

  reset: function(){
    AbstractTest.prototype.reset.call(this);
    this.childNodes.forEach(function(test){
      test.reset();
    });
  },

  destroy: function(){
    this.testByState_.destroy();
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

  create: createTestFactory
};
