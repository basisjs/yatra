require('basis.utils.info');

var OBJECT_TOSTRING = Object.prototype.toString;
var ERROR_WRONG_ANSWER = 'ERROR_WRONG_ANSWER';
var ERROR_TYPE_MISSMATCH = 'ERROR_TYPE_MISSMATCH';

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
      value = String(value);
      return !linear ? value : value.replace(/\{([\r\n]|.)*\}/, '{..}');

    case 'object':
      if (value === null)
        return 'null';

      if (Array.isArray(value))
        return '[' + value.map(value2string).join(', ') + ']';

      // NOTE: constructor check and instanceof doesn't work here,
      // because value is from sanbox
      if (OBJECT_TOSTRING.call(value) === '[object Date]')
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

        if (String(expected) != String(actual))
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

function getFnInfo(test){
  var info = basis.utils.info.fn(test);
  var args = info.args ? info.args.split(/\s*,\s*/) : [];
  var code = info.body
    .replace(/([\r\n]|\s)*\"use strict\";/, '') // Firefox adds "use strict" at the begining of function body
    .replace(/\r/g, '')
    .replace(/^(\s*\n)+|(\n\s*)*$/g, '');
  var minOffset = code.split(/\n+/).map(function(line){
    return line.match(/^(\s*)/)[0];
  }).sort()[0];

  return {
    args: args,
    code: code.replace(new RegExp('(^|\\n)' + minOffset, 'g'), '$1')
  };
}

module.exports = {
  sliceOwnOnly: sliceOwnOnly,
  makeStaticCopy: makeStaticCopy,
  value2string: value2string,
  compareValues: compareValues,
  getFnInfo: getFnInfo
};
