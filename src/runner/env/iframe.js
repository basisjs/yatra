var fnInfo = require('runner.source.info');
var Emitter = require('basis.event').Emitter;

function runInContext(contextWindow, code){
  (contextWindow.execScript || function(code){
    contextWindow['eval'].call(contextWindow, code);
  })(code);
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
  env: null,
  initCode: '',
  runInScope: null,
  runArgs: null,

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
  }
});

var FrameEnv = Emitter.subclass({
  html: null,

  init: function(){
    Emitter.prototype.init.call(this);

    this.scopes = [];
    this.element = iframeProto.cloneNode(true);
    this.element.onload = this.ready_.bind(this);
    this.element.src = this.html && this.html != 'default'
      ? this.html
      : basis.path.resolve(basis.config.runnerBaseURI || '', asset('./iframe.html'));

    basis.doc.body.add(this.element);
  },

  ready_: function(){
    var frameWindow = this.element.contentWindow;
    var initCode = '';
    var code = require('./iframe_inject.code');

    runInContext(frameWindow, code);
    this.createScope_ = frameWindow.__initTestEnvironment(function(){
      // env deprecates
      this.destroy();
    }.bind(this));

    this.scopes.forEach(function(scope){
      scope.attachJsScope(this.createScope_);
    }, this);
  },

  createScope: function(initCode){
    var scope = new Scope({
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

    this.createScope_ = null;
    this.scopes.forEach(function(scope){
      scope.destroy();
    });
    this.scopes = null;
  }
});

module.exports = FrameEnv;
