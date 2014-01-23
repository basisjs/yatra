var esprima = require('esprima');

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
  visitor.call(null, node);

  var branches = NODE_BRANCHES[node.type];
  for (var i = 0, key; key = branches[i]; i++)
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

module.exports = {
  parse: parse,
  traverseAst: traverseAst,
  translateAst: translateAst,
  translateNode: translateNode,
  getRangeTokens: getRangeTokens,
  getNodeRangeTokens: getNodeRangeTokens
};
