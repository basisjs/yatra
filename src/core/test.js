require('basis.data');
require('basis.data.value');
require('basis.data.index');
require('basis.data.dataset');
require('basis.dom.wrapper');
require('basis.utils.benchmark');

var envFactory = require('core.env');
var astTools = require('core.ast');
var arrayFrom = basis.array.from;

var ERROR_WRONG_ANSWER = 'ERROR_WRONG_ANSWER';
var ERROR_TYPE_MISSMATCH = 'ERROR_TYPE_MISSMATCH';
var ERROR_TEST_FAULT = 'ERROR_TEST_FAULT';
var ERROR_EMPTY = 'ERROR_EMPTY';
var ERROR_TEST_CRUSH = 'ERROR_TEST_CRUSH';
var ERROR_TIMEOUT = 'ERROR_TIMEOUT';

var NOP = function(){};

function sliceOwnOnly(obj){
  var result = {};

  for (var key in obj)
    if (obj.hasOwnProperty(key))
      result[key] = obj[key];

  return result;
}

function makeStaticCopy(value){
  if (value && typeof value == 'object')
    return Array.isArray(value)
      ? arrayFrom(value)
      : sliceOwnOnly(value);

  return value;
}

function value2string(value, linear){
  switch (typeof value)
  {
    case 'boolean':
    case 'number':
    case 'undefined':
      return String(value);

    case 'string':
      return '\'' + value.replace(/\'/g, '\\\'') + '\'';

    case 'function':
      return !linear ? value.toString() : value.toString().replace(/\{([\r\n]|.)*\}/, '{..}');

    case 'object':
      if (value === null)
        return 'null';

      if (Array.isArray(value))
        return '[' + value.map(value2string).join(', ') + ']';

      if (value.constructor == Date)
        return String(value);

      if (!linear)
      {
        var res = [];
        for (var key in value)
          if (value.hasOwnProperty(key))
            res.push(key + ': ' + value2string(value[key], true));

        return '{ ' + res.join(', ') + ' }';
      }
      else
        return '{object}';

    default:
      return 'unknown type `' + (typeof value) + '`';
  }
}

function compareValues(actual, expected){
  if (typeof actual != typeof expected)
    return ERROR_TYPE_MISSMATCH;

  if (actual != null && expected != null && actual.constructor !== expected.constructor)
    return ERROR_TYPE_MISSMATCH;

  if (actual != expected)
  {
    switch (typeof actual){
      case 'number':
      case 'string':
      case 'boolean':
      case 'function':
      case 'undefined':
        if (actual !== expected)
          return ERROR_WRONG_ANSWER;

      default:
        if (expected === actual)
          return;

        if ((!expected && actual) || (expected && !actual))
          return ERROR_WRONG_ANSWER;

        if (actual && 'length' in actual)
        {
          if (actual.length != expected.length)
            return ERROR_WRONG_ANSWER;

          for (var i = 0; i < actual.length; i++)
            if (actual[i] !== expected[i])
              return ERROR_WRONG_ANSWER;
        }
        else
        {
          for (var i in actual)
            if (!(i in expected) || actual[i] !== expected[i])
              return ERROR_WRONG_ANSWER;

          for (var i in expected)
            if (!(i in actual) || actual[i] !== expected[i])
              return ERROR_WRONG_ANSWER;
        }
    }
  }
}

function prepareTestSourceCode(fn){
  var code = basis.utils.info.fn(fn).body
    .replace(/([\r\n]|\s)*\"use strict\";/, '') // Firefox adds "use strict" at the begining of function body
    .replace(/\r/g, '')
    .replace(/^(\s*\n)+|(\n\s*)*$/g, '');
  var minOffset = code.split(/\n+/).map(function(line){
    return line.match(/^(\s*)/)[0];
  }).sort()[0];

  return code.replace(new RegExp('(^|\\n)' + minOffset, 'g'), '$1');
}

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

  // resolve test instance class
  var Class;
  var config = {
    data: data
  };

  if (typeof test == 'function')
  {
    var args = basis.utils.info.fn(test).args;

    config.data.async = !!args;
    config.data.testArgs = args ? args.split(/\s*,\s*/) : [];
    config.data.testSource = prepareTestSourceCode(test);

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

var AbstractTest = basis.dom.wrapper.Node.subclass({
  className: 'AbstractTest',

  name: '',
  envRunner: null,

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

  run: function(){
    // nothing to do
  }
});

var TestCase = AbstractTest.subclass({
  className: 'TestCase',

  name: '',
  testSource: null,
  testWrappedSource: null,

  childClass: null,

  getSourceCode: function(){
    if (this.testWrappedSource === null)
    {
      var source = this.data.testSource;
      var buffer = [];
      var token;
      var ast = astTools.parse(source);

      astTools.traverseAst(ast, function(node){
        if (node.type == 'CallExpression' &&
            node.callee.type == 'MemberExpression' &&
            node.callee.object.type == 'ThisExpression' &&
            node.callee.computed == false &&
            node.callee.property.type == 'Identifier' &&
            node.callee.property.name == 'is')
        {
          var token = astTools.getRangeTokens(ast, node.range[0], node.range[1])[0];
          token.value = '__isFor([' + node.range + '], ' + node.loc.end.line + ') || ' + token.value;
        }

        if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration')
        {
          var tokens = astTools.getNodeRangeTokens(node.body);
          tokens[0].value +=
            'try {\n';
          tokens[1].value =
            '\n} catch(e) {' +
              '__exception(e)' +
            '}' + tokens[1].value;
        }
      });

      buffer = astTools.translateAst(ast, 0, ast.source.length);

      this.testWrappedSource = buffer;
      //console.log(buffer);
    }

    return this.testWrappedSource;
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
    var report = {
      testSource: this.data.testSource,
      successCount: 0,
      testCount: 0,
      errorLines: {}
    };
    var async = this.data.async ? 1 : 0;
    var isNode = null;
    var __isFor = function(range, line){
      isNode = {
        range: range,
        line: line
      };
    };
    var env = {
      async: function(fn){
        async++;
        basis.nextTick(function(){
          async--;
          fn.call(this);
          if (!async)
            testDone();
        }.bind(this));
      },
      is: function checkAnswer(answer, result){
        var error = compareValues(answer, result);

        if (error)
        {
          if (isNode)
          {
            var line = isNode.line;
            var errors = report.errorLines[line];

            if (!errors)
              errors = report.errorLines[line] = [];

            errors.push({
              node: isNode,
              error: error,
              answer: makeStaticCopy(answer),
              answerStr: value2string(answer),
              result: makeStaticCopy(result),
              resultStr: value2string(result)
            });
          }
        }
        else
          report.successCount++;

        report.testCount++;
      },
      report: report
    };

    this.setState(basis.data.STATE.PROCESSING);

    var __exception = function(e){
      report.exception = e;
      report.testCount = 0;
      report.successCount = 0;
      error = ERROR_TEST_CRUSH;

      testDone();
    };

    var asyncDone = async
      ? basis.fn.runOnce(function(){
          async--;
          if (!async)
            testDone();
        })
      : NOP;

    var testDone = function(){
      time = basis.utils.benchmark.time(startTime);
      timeoutTimer = clearTimeout(timeoutTimer);

      if (!error && !report.testCount)
        error = ERROR_EMPTY;

      if (!error && report.testCount != report.successCount)
        error = ERROR_TEST_FAULT;

      basis.object.extend(report, {
        time: time,
        error: error,
        empty: !error && report.testCount == 0,
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


    this.getEnvRunner(true).run(
      this.data.testArgs.concat('__isFor', '__exception'),
      this.getSourceCode(),
      this,
      function(testFn){
        startTime = basis.utils.benchmark.time();

        var args = basis.array.create(this.data.testArgs.length);
        if (args.length)
          args[0] = asyncDone;
        args.push(__isFor, __exception);

        try {
          testFn.apply(env, args);
        } catch(e) {
          __exception(e);
          return;
        }

        if (!async)
          testDone(this);
        else
          timeoutTimer = setTimeout(function(){
            error = ERROR_TIMEOUT;
            testDone();
          }, 250);
      }
    );
  }
});

// function aggregateCount(test){
//   return test.nonEmpty_ ? test.nonEmpty_.itemCount : 1;
// }

// function aggregateErrors(test){
//   return test.nonEmpty_ && test.state.data
//     ? test.state.data.data.testCount - test.state.data.data.successCount
//     : 1;
// }

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
    this.nonEmpty_ = new basis.data.dataset.Subset({
      source: this.nestedTests_,
      ruleEvents: 'stateChanged',
      rule: function(test){
        return test.state != basis.data.STATE.ERROR ||
               !test.state.data ||
               test.state.data.data.error != ERROR_EMPTY;
      }
    });
    this.testByState_ = new basis.data.dataset.Split({
      source: this.nonEmpty_,
      ruleEvents: 'stateChanged',
      rule: function(test){
        return String(test.state);
      }
    });

    this.state_ = new basis.data.value.Expression(
      basis.data.index.count(this.nonEmpty_),
      basis.data.index.count(this.testByState_.getSubset('processing', true)),
      basis.data.index.count(this.testByState_.getSubset('error', true)),
      basis.data.index.count(this.testByState_.getSubset('ready', true)),
      function(count, processing, error, ready){
        if (!count)
          return [
            basis.data.STATE.ERROR,
            new basis.data.Object({
              data: {
                error: ERROR_EMPTY,
                empty: true,
                testCount: count,
                successCount: ready
              }
            })
          ];

        if (processing + error + ready == 0)
          return [basis.data.STATE.UNDEFINED];

        if (processing || error + ready < count)
          return [
            basis.data.STATE.PROCESSING,
            (error + ready) / count
          ];

        return [
          error ? basis.data.STATE.ERROR : basis.data.STATE.READY,
          new basis.data.Object({
            data: {
              error: error ? ERROR_TEST_FAULT : null,
              empty: !count,
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
    this.nonEmpty_.destroy()
    this.nonEmpty_ = null;
    this.nestedTests_.destroy();
    this.nestedTests_ = null;
    this.state_.destroy();
    this.state_ = null;

    basis.dom.wrapper.Node.prototype.destroy.call(this);
  }
});


module.exports = {
  AbstractTest: AbstractTest,
  TestCase: TestCase,
  TestSuite: TestSuite,
  create: createTestFactory
};
