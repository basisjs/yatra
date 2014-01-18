require('basis.data');
require('basis.dom.wrapper');

var envFactory = require('./env.js');
var arrayFrom = basis.array.from;

var ERROR_WRONG_ANSWER = 'ERROR_WRONG_ANSWER';
var ERROR_TYPE_MISSMATCH = 'ERROR_TYPE_MISSMATCH';
var ERROR_TEST_FAULT = 'ERROR_TEST_FAULT';

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

function checkAnswer(answer, result){
  var error = resolveError(answer, result);

  this.report.testCount++;

  if (error)
    this.report.errorLines[this.report.testCount] = {
      error: error,
      answer: makeStaticCopy(answer),
      result: makeStaticCopy(result)
    };
  else
    this.report.successCount++;
};

var Test = basis.dom.wrapper.Node.subclass({
  className: 'Test',

  name: '',
  test: function(){
  },

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

      if (Array.isArray(test))
        this.setChildNodes(test);
      else
        this.test = test;
    }
  },

  childClass: basis.Class.SELF,
  childFactory: function(cfg){
    return new this.childClass({
      data: cfg
    });
  },

  reset: function(){
    this.setState(basis.data.STATE.UNDEFINED);
    this.childNodes.forEach(function(test){
      test.reset();
    });
  },
  run: function(){
    var _warn = basis.dev.warn;
    var _error = basis.dev.error;
    var warnMessages = [];
    var errorMessages = [];
    var report = new basis.data.Object();
    var isSuccess;
    var error;
    var envRunner;
    var env = {
      is: checkAnswer,
      report: {
        successCount: 0,
        testCount: 0,
        errorLines: []
      }
    };

    this.setState(basis.data.STATE.PROCESSING);

    if (!this.data.init)
    {
      var cursor = this.parentNode;
      while (cursor && !cursor.envRunner)
        cursor = cursor.parentNode;

      envRunner = cursor && cursor.envRunner;
    }

    if (this.data.init || !envRunner)
    {
      envRunner = envFactory.create(this.data.init, this.data.html);
      this.envRunner = envRunner;
    }

    envRunner.run(this.test, this, function(test){
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

      if (!error && env.report.testCount != env.report.successCount)
        error = ERROR_TEST_FAULT;

      basis.object.extend(env.report, {
        error: error,
        empty: !error && env.report.testCount == 0,
        warns: warnMessages.length ? warnMessages : null
      });

      report.update(env.report);

      this.setState(
        error || errorMessages.length
          ? basis.data.STATE.ERROR
          : basis.data.STATE.READY,
        report
      );

      if (this.envRunner)
        this.envRunner.destroy();
    });
  }
});

module.exports = Test;
