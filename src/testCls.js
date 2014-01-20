require('basis.data');
require('basis.data.value');
require('basis.data.index');
require('basis.data.dataset');
require('basis.dom.wrapper');
require('esprima');

var envFactory = require('./env.js');
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

function resolveError(answer, result){
  if (typeof answer != typeof result)
    return ERROR_TYPE_MISSMATCH;

  if (answer != null && result != null && answer.constructor !== result.constructor)
    return ERROR_TYPE_MISSMATCH;

  if (answer != result)
  {
    switch (typeof answer){
      case 'number':
      case 'string':
      case 'boolean':
      case 'function':
      case 'undefined':
        if (answer !== result)
          return ERROR_WRONG_ANSWER;

      default:
        if (result === answer)
          return;

        if ((!result && answer) || (result && !answer))
          return ERROR_WRONG_ANSWER;

        if (answer && 'length' in answer)
        {
          if (answer.length != result.length)
            return ERROR_WRONG_ANSWER;

          for (var i = 0; i < answer.length; i++)
            if (answer[i] !== result[i])
              return ERROR_WRONG_ANSWER;
        }
        else
        {
          for (var i in answer)
            if (!(i in result) || answer[i] !== result[i])
              return ERROR_WRONG_ANSWER;

          for (var i in result)
            if (!(i in answer) || answer[i] !== result[i])
              return ERROR_WRONG_ANSWER;
        }
    }
  }
}

function prepareTestSourceCode(fn){
  var code = basis.utils.info.fn(fn).body.replace(/^(\s*\n)+|(\n\s*)*$/g, '');
  var minOffset = code.split(/\n+/).map(function(line){
    return line.match(/^(\s*)/)[0]
  }).sort()[0];

  return code.replace(new RegExp('(^|\\n)' + minOffset, 'g'), '$1');
}

function refAst(node){
  for (var key in node)
    if (node.hasOwnProperty(key))
    {
      var value = node[key];
      if (typeof value == 'object' && value !== null)
      {
        if (Array.isArray(value))
        {
          value.forEach(function(child){
            refAst(child);
            child.parentNode = node;
            child.parentCollection = this;
          }, value);
        }
        else
        {
          refAst(value);
          value.parentNode = node;
        }
      }
    }

  return node;
}

function traverseAst(node, visitor){
  visitor.call(null, node);

  for (var key in node)
    if (node.hasOwnProperty(key) && key != 'parentNode' && key != 'parentCollection')
    {
      var value = node[key];
      if (typeof value == 'object' && value !== null)
      {
        if (Array.isArray(value))
          value.forEach(function(child){
            traverseAst(child, visitor);
          });
        else
          traverseAst(value, visitor);
      }
    }
}

function getRangeTokens(ast, start, end){
  var first;

  for (var i = 0, pre, prev, token; i < ast.tokens.length; i++)
  {
    token = ast.tokens[i];

    if (token.range[0] < start)
      continue;

    if (token.range[1] > end)
    {
      token = prev;
      break;
    }

    if (!first)
      first = token;

    prev = token;
  }

  return [first, token];
}

function translateAst(ast, start, end){
  var source = ast.source;
  var buffer = [];

  for (var i = 0, pre, prev, token; i < ast.tokens.length; i++)
  {
    token = ast.tokens[i];

    if (token.range[0] < start)
      continue;

    if (token.range[1] > end)
    {
      token = prev;
      break;
    }

    pre = source.substring(prev ? prev.range[1] : start, token.range[0]);

    if (pre)
      buffer.push(pre);

    buffer.push(token.value);
    prev = token;
  }

  buffer.push(source.substring(token ? token.range[1] : start, end));

  return buffer.join('');
}

function translateNode(node){
  var ast = node;

  while (ast.parentNode)
    ast = ast.parentNode;

  return translateAst(ast, node.range[0], node.range[1]);
}

var Test = basis.dom.wrapper.Node.subclass({
  className: 'Test',

  name: '',
  testSource: null,
  test: null,

  // name
  // before
  // test
  // after
  init: function(){
    basis.dom.wrapper.Node.prototype.init.call(this);

    var test = this.data.test || this.data.testcase;
    if (test)
    {
      if (basis.resource.isResource(test))
        test = test.fetch();

      if (typeof test == 'function')
      {
        var code = prepareTestSourceCode(test);
        var buffer = [];
        var token;
        var ast = refAst(esprima.parse(code, {
          loc: true,
          range: true,
          comment: true,
          tokens: true
        }));

        ast.source = code;

        traverseAst(ast, function(node){
          if (node.type == 'CallExpression' &&
              node.callee.type == 'MemberExpression' &&
              node.callee.object.type == 'ThisExpression' &&
              node.callee.computed == false &&
              node.callee.property.type == 'Identifier' &&
              node.callee.property.name == 'is')
          {
            var tokens = getRangeTokens(ast, node.range[0], node.range[1]);
            //console.log(tokens[0].value, tokens[1].value);
            tokens[0].value = 'this.isFor([' + node.range + '], ' + node.loc.end.line + ') || ' + tokens[0].value;
            //console.log(translateNode(node));
          }
        });

        buffer = translateAst(ast, 0, ast.source.length);

        this.testSource = code;
        this.test = buffer;
        //console.log(buffer);
      }
      else
      {
        this.setChildNodes(test);

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
      }
    }
  },

  childClass: basis.Class.SELF,
  childFactory: function(cfg){
    return new this.childClass({
      data: cfg
    });
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
    this.setState(basis.data.STATE.UNDEFINED);

    if (this.envRunner)
    {
      this.envRunner.destroy();
      this.envRunner = null;
    }

    this.childNodes.forEach(function(test){
      test.reset();
    });
  },
  run: function(){
    if (this.test === null)
      return;

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
        var error = resolveError(answer, result);

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
      } catch(e) {
        env.report.testCount++;

        error = e;
      } finally {
        // basis.dev.warn = _warn;
        // basis.dev.error = _error;
      }

      this.childNodes.forEach(function(test){
        test.run();
        this.testCount++;
        this.successCount += test.state == basis.data.STATE.READY;
      }, env.report);

      if (!error && !env.report.testCount)
        error = ERROR_EMPTY;

      if (!error && env.report.testCount != env.report.successCount)
        error = ERROR_TEST_FAULT;

      basis.object.extend(env.report, {
        error: error,
        empty: !error && env.report.testCount == 0,
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
  },

  destroy: function(){
    this.testByState_.destroy()
    this.testByState_ = null;
    this.state_.destroy();
    this.state_ = null;

    basis.dom.wrapper.Node.prototype.destroy.call(this);
  }
});

module.exports = Test;
