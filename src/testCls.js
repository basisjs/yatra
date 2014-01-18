require('basis.data');
require('basis.data.value');
require('basis.data.index');
require('basis.data.dataset');
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
        this.test = test;
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
                error: error ? ERROR_TEST_FAULT : null,
                empty: !count,
                testCount: count,
                successCount: ready
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

    if (this.data.init || !envRunner)
    {
      envRunner = envFactory.create(this.data.init, this.data.html);
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
    if (typeof this.test != 'function')
      return;

    var _warn = basis.dev.warn;
    var _error = basis.dev.error;
    var warnMessages = [];
    var errorMessages = [];
    var report = new basis.data.Object();
    var isSuccess;
    var error;
    var env = {
      is: checkAnswer,
      report: {
        successCount: 0,
        testCount: 0,
        errorLines: []
      }
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
