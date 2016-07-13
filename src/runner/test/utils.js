var arrayFrom = basis.array.from;
var OBJECT_TOSTRING = Object.prototype.toString;
var ERROR_WRONG_ANSWER = 'ERROR_WRONG_ANSWER';
var ERROR_TYPE_MISSMATCH = 'ERROR_TYPE_MISSMATCH';
var getFunctionInfo = require('./source/info.js');

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

function value2string(value, linear, deep){
  switch (typeof value)
  {
    case 'boolean':
    case 'number':
    case 'undefined':
      return String(value);

    case 'string':
      return '\'' + value.replace(/\'/g, '\\\'') + '\'';

    case 'function':
      if (value.originalFn_)
        value = value.originalFn_;

      value = String(value);
      return !linear ? value : value.replace(/\{([\r\n]|.)*\}/, '{..}');

    case 'object':
      if (value === null)
        return 'null';

      if (Array.isArray(value))
        return '[' + value.map(function(val){
          return value2string(val, !deep, deep);
        }).join(', ') + ']';

      // NOTE: constructor check and instanceof doesn't work here,
      // because value comes from sandbox
      if (OBJECT_TOSTRING.call(value) === '[object Date]' ||
          OBJECT_TOSTRING.call(value) === '[object RegExp]')
        return String(value);

      if (value && value.constructor === Number) debugger;

      if (!linear)
      {
        var res = [];
        var keys = Object.keys(value).sort();

        for (var i = 0, key; i < keys.length; i++)
        {
          key = keys[i];
          if (value.hasOwnProperty(key))
            res.push(key + ': ' + value2string(value[key], !deep, deep));
        }

        if (!res.length && value.valueOf() !== value)
        {
          var m = (value.constructor).toString().match(/function (Number|String|Boolean)/);
          if (m)
            return 'new Object(' + value2string(value.valueOf()) + ')';
        }

        return '{ ' + (res.length ? res.join(', ') + ' ' : '') + '}';
      }
      else
        return '{object}';

    default:
      return 'unknown type `' + (typeof value) + '`';
  }
}

function isTruthy(value){
  if (!value)
    return ERROR_WRONG_ANSWER;
}

function compareValues(actual, expected, deep){
  var error;

  if (actual === expected)
    return;

  if (typeof actual != typeof expected)
    return ERROR_TYPE_MISSMATCH;

  if (actual != null && expected != null && actual.constructor !== expected.constructor)
    return ERROR_TYPE_MISSMATCH;

  if (actual == expected)
    return;

  switch (typeof actual){
    case 'string':
    case 'boolean':
    case 'undefined':
      return ERROR_WRONG_ANSWER;

    case 'number':
      // check for NaN
      if (actual !== actual && expected !== expected)
        return;

      return ERROR_WRONG_ANSWER;

    case 'function':
      if (expected.originalFn_)
        expected = expected.originalFn_;

      if (actual.originalFn_)
        actual = actual.originalFn_;

      if (String(expected) == String(actual))
        return;

      return ERROR_WRONG_ANSWER;

    default:
      if ((!expected && actual) || (expected && !actual))
        return ERROR_WRONG_ANSWER;

      if (String(expected) != String(actual))
        return ERROR_WRONG_ANSWER;

      if (actual && 'length' in actual)
      {
        if (actual.length != expected.length)
          return ERROR_WRONG_ANSWER;

        for (var i = 0; i < actual.length; i++)
        {
          if (actual[i] !== expected[i])
          {
            if (deep && !actual.__antirecursion__)
            {
              actual.__antirecursion__ = true;
              error = compareValues(actual[i], expected[i], deep);
              delete actual.__antirecursion__;

              if (error)
                return error;

              continue;
            }

            return ERROR_WRONG_ANSWER;
          }
        }
      }
      else
      {
        for (var i in actual)
          if (i in expected == false || actual[i] !== expected[i])
          {
            if (deep && i in expected && !actual.__antirecursion__)
            {
              actual.__antirecursion__ = true;
              error = compareValues(actual[i], expected[i], deep);
              delete actual.__antirecursion__;

              if (error)
                return error;

              continue;
            }

            return ERROR_WRONG_ANSWER;
          }

        for (var i in expected)
          if (i in actual == false)
            return ERROR_WRONG_ANSWER;
      }
  }
}

module.exports = {
  sliceOwnOnly: sliceOwnOnly,
  makeStaticCopy: makeStaticCopy,
  value2string: value2string,
  compareValues: compareValues,
  isTruthy: isTruthy,
  getFnInfo: function(fn){
    return getFunctionInfo(fn.toString());
  }
};
