// import esprima as regular basis.js module and as worker environment
var esprima;
if (typeof importScripts == 'function')
  importScripts('../../../bower_components/esprima/esprima.js');
else
  esprima = require('esprima');

//
// ast tools
//

var TRAVERSE_ABORT = 1;
var TRAVERSE_STOP_DEEP = 2;

var NODE_BRANCHES = {
  ArrayExpression: ['elements'],
  AssignmentExpression: ['left', 'right'],
  BinaryExpression: ['left', 'right'],
  BlockStatement: ['body'],
  BreakStatement: ['label'],
  CallExpression: ['callee', 'arguments'],
  CatchClause: ['param', 'body'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  ContinueStatement: ['label'],
  DebuggerStatement: [],
  DoWhileStatement: ['test', 'body'],
  EmptyStatement: [],
  ExpressionStatement: ['expression'],
  ForInStatement: ['left', 'right', 'body'],
  ForStatement: ['init', 'test', 'update', 'body'],
  FunctionDeclaration: ['id', 'params', 'body'],
  FunctionExpression: ['id', 'params', 'defaults', 'body'],
  Identifier: [],
  IfStatement: ['test', 'consequent', 'alternate'],
  LabeledStatement: ['label', 'body'],
  Literal: [],
  LogicalExpression: ['left', 'right'],
  MemberExpression: ['object', 'property'],
  NewExpression: ['callee', 'arguments'],
  ObjectExpression: ['properties'],
  Program: ['body'],
  Property: ['key', 'value'],
  ReturnStatement: ['argument'],
  SequenceExpression: ['expressions'],
  SwitchCase: ['test', 'consequent'],
  SwitchStatement: ['discriminant', 'cases'],
  ThisExpression: [],
  ThrowStatement: ['argument'],
  TryStatement: ['block', 'handlers', 'finalizer'],
  UnaryExpression: ['argument'],
  UpdateExpression: ['argument'],
  VariableDeclaration: ['declarations'],
  VariableDeclarator: ['id', 'init'],
  WhileStatement: ['test', 'body'],
  WithStatement: ['object', 'body']
};

function parse(code){
  function postProcessing(node){
    var branches = NODE_BRANCHES[node.type];
    for (var i = 0, key; key = branches[i]; i++)
    {
      var value = node[key];
      if (typeof value == 'object' && value !== null)
      {
        if (Array.isArray(value))
        {
          value.forEach(function(child){
            postProcessing(child);
            child.root = result;
            child.parentNode = node;
            child.parentCollection = value;
          });
        }
        else
        {
          postProcessing(value);
          value.root = result;
          value.parentNode = node;
        }
      }
    }
  }

  var result = esprima.parse(code, {
    loc: true,
    range: true,
    comment: true,
    tokens: true
  });

  postProcessing(result);
  result.source = code;
  result.root = result;

  return result;
}

function traverseAst(node, visitor){
  var res = visitor.call(null, node);
  if (res)
    return res == TRAVERSE_ABORT ? res : false;

  var branches = NODE_BRANCHES[node.type];
  for (var i = 0, key; key = branches[i]; i++)
  {
    var value = node[key];
    if (typeof value == 'object' && value !== null)
    {
      if (Array.isArray(value))
      {
        for (var j = 0, child; child = value[j]; j++)
          if (traverseAst(child, visitor) & TRAVERSE_ABORT)
            return TRAVERSE_ABORT;
      }
      else
      {
        if (traverseAst(value, visitor) & TRAVERSE_ABORT)
          return TRAVERSE_ABORT;
      }
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

function getNodeRangeTokens(node){
  return getRangeTokens(node.root, node.range[0], node.range[1]);
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
  return translateAst(node.root, node.range[0], node.range[1]);
}


//
// source tools
//

function wrapSource(source, breakpointAt){
  function wrapToBlock(node){
    if (node.parentNode.type != 'BlockStatement' && node.parentNode.type != 'Program')
    {
      var tokens = getNodeRangeTokens(node);
      tokens[0].value = '{\n' + tokens[0].value;
      tokens[1].value = tokens[1].value + '\n}';
    }
  }

  var ast = parse(source);


  if (breakpointAt == 'none')
  {
    traverseAst(ast, function(node){
      if (node.type == 'Program')
        return;

      if (node.type == 'FunctionExpression')
      {
        var tokens = getNodeRangeTokens(node);
        var orig = translateAst(ast, tokens[0].range[0], tokens[1].range[1]);
        tokens[0].value = '__wrapFunctionExpression(' + tokens[0].value;
        tokens[1].value += ', ' + orig + ')';
      }

      if (node.type == 'FunctionDeclaration')
      {
        // var tokens = getNodeRangeTokens(node);
        // var orig = translateAst(ast, tokens[0].range[0], tokens[1].range[1]);
        // tokens[1].value += node.id.name + '.originalFn_ = (' + orig + ');';

        var tokens = getNodeRangeTokens(node.body);
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
          var token = getNodeRangeTokens(node)[0];
          var singleArg = node.arguments.length == 1 ? node.arguments[0] : null;
          var isForCode = 'if(__isFor(' + node.range + ',' + (node.loc.end.line - 1) + '))debugger;\n';
          var newValue = token.value.replace(/^__enterLine\(\d+\); /, isForCode);

          token.value = newValue != token.value ? newValue : isForCode + token.value;

          wrapToBlock(node.parentNode);

          if (singleArg &&
              singleArg.type == 'BinaryExpression' &&
              singleArg.operator.match(/^(===?)$/)) // |!==?|>=?|<=
          {
            var arg0 = node.arguments[0];
            var leftToken = getNodeRangeTokens(arg0.left);
            var rightToken = getNodeRangeTokens(arg0.right);

            leftToken[0].value = '__actual("' + arg0.operator + '",' + leftToken[0].value;
            leftToken[1].value += ')';
            rightToken[0].value = '__expected(' + rightToken[0].value;
            rightToken[1].value += ')';
          }
        }
      }

      if (node.parentNode.type == 'BlockStatement' || node.parentNode.type == 'Program')
      {
        var firstToken = getNodeRangeTokens(node)[0];
        firstToken.value = '__enterLine(' + (firstToken.loc.start.line - 1) + '); ' + firstToken.value;
      }
    });
  }

  return translateAst(ast, 0, ast.source.length);
}


//
// export
//

// for worker environment
if (typeof module != 'undefined')
{
  module.exports = {
    TRAVERSE_ABORT: TRAVERSE_ABORT,
    TRAVERSE_STOP_DEEP: TRAVERSE_STOP_DEEP,

    parse: parse,
    traverseAst: traverseAst,
    translateAst: translateAst,
    translateNode: translateNode,
    getRangeTokens: getRangeTokens,
    getNodeRangeTokens: getNodeRangeTokens,

    wrapSource: wrapSource
  };
}
