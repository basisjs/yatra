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
  var code = basis.utils.info.fn(fn).body.replace(/\r/g, '').replace(/^(\s*\n)+|(\n\s*)*$/g, '');
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
    config.data.test = test;
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
  getEnvRunner: function(){
    if (this.envRunner)
      return this.envRunner;

    var envRunner;

    if (!this.data.init)
      envRunner = this.parentNode && this.parentNode.getEnvRunner();

    if (this.data.init || this.data.html || !envRunner)
    {
      envRunner = envFactory.create(this.data.init, this.data.html);
      envRunner.addHandler({
        destroy: this.reset
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
  test: null,

  // name
  // before
  // test
  // after
  init: function(){
    basis.dom.wrapper.Node.prototype.init.call(this);

    var test = this.data.test;

    var code = prepareTestSourceCode(test);
    var buffer = [];
    var token;
    var ast = astTools.parse(code);

    astTools.traverseAst(ast, function(node){
      if (node.type == 'CallExpression' &&
          node.callee.type == 'MemberExpression' &&
          node.callee.object.type == 'ThisExpression' &&
          node.callee.computed == false &&
          node.callee.property.type == 'Identifier' &&
          node.callee.property.name == 'is')
      {
        var tokens = astTools.getRangeTokens(ast, node.range[0], node.range[1]);
        //console.log(tokens[0].value, tokens[1].value);
        tokens[0].value = 'this.isFor([' + node.range + '], ' + node.loc.end.line + ') || ' + tokens[0].value;
        //console.log(translateNode(node));
      }
    });

    buffer = astTools.translateAst(ast, 0, ast.source.length);

    this.testSource = code;
    this.test = buffer;
    //console.log(buffer);
  },

  childClass: null,

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
    var report = {
      testSource: this.testSource,
      successCount: 0,
      testCount: 0,
      errorLines: {}
    };
    var isNode = null;
    var env = {
      isFor: function(range, line){
        isNode = {
          range: range,
          line: line
        };
      },
      is: function checkAnswer(answer, result){
        var error = compareValues(answer, result);

        if (error)
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
        else
          report.successCount++;

        report.testCount++;
      },
      report: report
    };

    this.setState(basis.data.STATE.PROCESSING);

    this.getEnvRunner().run(this.test, this, function(test){
      var start = basis.utils.benchmark.time();
      var time = NaN;
      try {
        // basis.dev.warn = function(){
        //   warnMessages.push(arguments);
        //   _warn.apply(this, arguments);
        // };
        // basis.dev.error = function(){
        //   errorMessages.push(arguments);
        //   _error.apply(this, arguments);
        // };

        test.call(env);
        time = basis.utils.benchmark.time(start);
      } catch(e) {
        report.testCount++;

        error = e;
      } finally {
        // basis.dev.warn = _warn;
        // basis.dev.error = _error;
      }

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
    });
  }
});

var TestSuite = AbstractTest.subclass({
  className: 'TestSuite',

  childFactory: createTestFactory,
  childClass: AbstractTest,

  init: function(){
    AbstractTest.prototype.init.call(this);

    this.testByState_ = new basis.data.dataset.Split({
      source: this.getChildNodesDataset(),
      ruleEvents: 'stateChanged',
      rule: function(test){
        return String(test.state);
      }
    });

    this.state_ = new basis.data.value.Expression(
      basis.data.index.count(this.getChildNodesDataset()),
      basis.data.index.count(this.testByState_.getSubset('processing', true)),
      basis.data.index.count(this.testByState_.getSubset('error', true)),
      basis.data.index.count(this.testByState_.getSubset('ready', true)),
      function(count, processing, error, ready){
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
    ).link(this, function(state){
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
