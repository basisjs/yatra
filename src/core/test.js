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

  // fallback name
  if (!data.name)
    data.name = 'Untitled test';

  data.beforeEach = typeof data.beforeEach == 'function'
    ? utils.getFnInfo(data.beforeEach).code
    : false;
  data.afterEach = typeof data.afterEach == 'function'
    ? utils.getFnInfo(data.afterEach).code
    : false;

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
    config.data.type = 'case';

    Class = TestCase;
  }
  else
  {
    config.childNodes = !Array.isArray(test) ? [] : test;
    config.data.type = 'suite';

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

var AbstractTest = DomWrapperNode.subclass({
  className: 'AbstractTest',

  name: '',
  envRunner: null,

  init: function(){
    DomWrapperNode.prototype.init.call(this);

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
    DomWrapperNode.prototype.destroy.call(this);

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

function wrapSource(source, breakpointAt){
  var ast = astTools.parse(source);

  if (breakpointAt == 'none')
    astTools.traverseAst(ast, function(node){
      if (node.type == 'Program')
        return;

      if (node.type == 'FunctionExpression')
      {
        var tokens = astTools.getNodeRangeTokens(node);
        var orig = astTools.translateAst(ast, tokens[0].range[0], tokens[1].range[1]);
        tokens[0].value = '__wrapFunctionExpression(' + tokens[0].value;
        tokens[1].value += ', ' + orig + ')';
      }

      if (node.type == 'FunctionDeclaration')
      {
        // var tokens = astTools.getNodeRangeTokens(node);
        // var orig = astTools.translateAst(ast, tokens[0].range[0], tokens[1].range[1]);
        // tokens[1].value += node.id.name + '.originalFn_ = (' + orig + ');';

        var tokens = astTools.getNodeRangeTokens(node.body);
        tokens[0].value +=
          '\ntry {\n';
        tokens[1].value =
          '\n} catch(e) {' +
            '__exception(e);' +
            'throw e;' +
          '}\n' + tokens[1].value;
      }

      if (node.type == 'CallExpression')
      {
        if (node.parentNode.type == 'ExpressionStatement')
        {
          var token = astTools.getNodeRangeTokens(node)[0];
          var singleArg = node.arguments.length == 1 ? node.arguments[0] : null;
          token.value = '__isFor([' + node.range + '], ' + (node.loc.end.line - 1) + ') || ' + token.value;

          if (singleArg &&
              singleArg.type == 'BinaryExpression' &&
              singleArg.operator.match(/^(===?)$/)) // |!==?|>=?|<=
          {
            var leftToken = astTools.getNodeRangeTokens(node.arguments[0].left);
            var rightToken = astTools.getNodeRangeTokens(node.arguments[0].right);

            leftToken[0].value = '__actual("' + node.arguments[0].operator + '",' + leftToken[0].value;
            leftToken[1].value += ')';
            rightToken[0].value = '__expected(' + rightToken[0].value;
            rightToken[1].value += ')';
          }
        }
      }

      if (node.parentNode.type == 'BlockStatement' || node.parentNode.type == 'Program')
      {
        var firstToken = astTools.getNodeRangeTokens(node)[0];
        firstToken.value = '__enterLine(' + (firstToken.loc.start.line - 1) + ');' + firstToken.value;
      }
    });

  return astTools.translateAst(ast, 0, ast.source.length);
}

var TestCase = AbstractTest.subclass({
  className: 'TestCase',

  name: '',
  testSource: null,
  testWrappedSources: null,

  childClass: null,

  getSourceCode: function(wrapped, breakpointAt){
    var source = this.data.testSource;
    var cursor = this;
    var before = [];
    var after = [];
    var beforeLines = 0;
    var beforeCount = 0;
    var afterLines = 0;
    var afterCount = 0;

    while (cursor && cursor instanceof AbstractTest)
    {
      if (cursor.data.beforeEach)
        before.unshift(cursor.data.beforeEach);
      if (cursor.data.afterEach)
        after.push(cursor.data.afterEach);

      cursor = cursor.parentNode;
    }

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

    if (!wrapped)
      return {
        beforeLines: beforeLines,
        beforeCount: beforeCount,
        source: source,
        afterLines: afterLines,
        afterCount: afterCount
      };

    if (typeof breakpointAt != 'number')
      breakpointAt = 'none';

    if (this.testWrappedSources === null)
      this.testWrappedSources = {};

    if (!this.testWrappedSources[breakpointAt])
      this.testWrappedSources[breakpointAt] =
        'function(' + this.data.testArgs.concat('assert', '__isFor', '__enterLine', '__exception', '__wrapFunctionExpression', '__actual', '__expected').join(', ') + '){\n' +
          wrapSource(source, breakpointAt) +
        '\n}';

    return this.testWrappedSources[breakpointAt];
  },

  reset: function(){
    AbstractTest.prototype.reset.call(this);
    this.setState(STATE.UNDEFINED);
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
    var sourceCode = this.getSourceCode();

    var implicitCompare;
    var actual_;
    var expected_;

    var report = {
      test: null,
      beforeLines: sourceCode.beforeLines,
      beforeCount: sourceCode.beforeCount,
      testSource: sourceCode.source,
      afterLines: sourceCode.afterLines,
      afterCount: sourceCode.afterCount,
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
    }

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
    this.getEnvRunner(true).run(
      this.getSourceCode(sourceCode),
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
        var args = basis.array.create(this.data.testArgs.length);
        if (args.length)
          args[0] = asyncDone;
        args.push(assert, __isFor, __enterLine, __exception, __wrapFunctionExpression,
          __actual, __expected);

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
