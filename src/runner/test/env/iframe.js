var event = require('basis.event');
var Emitter = require('basis.event').Emitter;
var fnInfo = require('../source/info.js');

function runInContext(contextWindow, code){
  (contextWindow.execScript || function(code){
    contextWindow.eval.call(contextWindow, code);
  })(code);
}

function wrapToRunInContext(fn, context){
  return function(){
    return fn.apply(context, arguments);
  };
}

var iframeProto = document.createElement('iframe');
iframeProto.setAttribute('style', [
  'width: 10px',
  'height: 10px',
  'top: -100px',
  'position: absolute',
  'border: none',
  'opacity: 0.0001'
].join(';'));

var Scope = Emitter.subclass({
  className: 'Scope',

  env: null,
  initCode: '',
  runInScope: null,
  runArgs: null,

  Array: function(){
    throw new Error('Array() invoked before environment init');
  },
  setTimeout: function(){
    throw new Error('setTimeout() invoked before environment init');
  },
  clearTimeout: function(){
    throw new Error('clearTimeout() invoked before environment init');
  },

  attachJsScope: function(createScope){
    try {
      this.runInScope = createScope(this.initCode);
    } catch(e) {
      this.runInScope = function(){
        return function(){
          throw new Error('Test environment init error: ' + e.message);
        };
      };
    }

    if (this.runArgs)
    {
      this.run.apply(this, this.runArgs);
      this.runArgs = null;
    }
  },

  run: function(code, context, runTest){
    if (this.runInScope)
      runTest.call(context, this.runInScope(code));
    else
      this.runArgs = arguments;
  },

  destroy: function(){
    this.env = null;
    this.runArgs = null;
    this.runInScope = null;
    this.initCode = null;
  }
});

var FrameEnv = Emitter.subclass({
  className: 'FrameEnv',

  html: null,

  scopeClass: Scope,

  emit_fileChange: event.create('fileChange'),

  init: function(){
    Emitter.prototype.init.call(this);

    this.scopeClass = this.scopeClass.subclass();
    this.scopes = [];
    this.element = iframeProto.cloneNode(true);
    this.element.name = basis.genUID(); // hope it prevents cache issues
    this.element.onload = this.ready_.bind(this);
    this.element.src = this.html && this.html != 'default'
      ? this.html
      : basis.path.resolve(basis.config.runnerBaseURI || '', asset('./iframe.html'));

    basis.doc.body.add(this.element);
  },

  ready_: function(){
    var frameWindow = this.element.contentWindow;

    runInContext(frameWindow, require('./iframe_inject.code'));

    this.createScope_ = frameWindow.__initTestEnvironment(this.emit_fileChange.bind(this));

    this.scopeClass.extend({
      Array: frameWindow.Array,
      setTimeout: wrapToRunInContext(frameWindow.setTimeout, frameWindow),
      clearTimeout: wrapToRunInContext(frameWindow.clearTimeout, frameWindow)
    });

    this.scopes.forEach(function(scope){
      scope.attachJsScope(this.createScope_);
    }, this);
  },

  createScope: function(initCode){
    var scope = new this.scopeClass({
      env: this,
      initCode: initCode ? fnInfo(String(initCode)).body : ''
    });

    if (this.createScope_)
      scope.attachJsScope(this.createScope_);

    this.scopes.push(scope);

    return scope;
  },

  destroy: function(){
    Emitter.prototype.destroy.call(this);

    if (this.element.parentNode)
      this.element.parentNode.removeChild(this.element);
    this.element = null;

    basis.object.splice(this.scopeClass.prototype, ['Array', 'setTimeout', 'clearTimeout']);

    this.createScope_ = null;
    this.scopes.forEach(function(scope){
      scope.destroy();
    });
    this.scopes = null;

    this.html = null;
  }
});

module.exports = FrameEnv;
