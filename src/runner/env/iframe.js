var fnInfo = require('basis.utils.info').fn;
var Node = require('basis.dom.wrapper').Node;

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

var FrameEnv = Node.subclass({
  applyEnvironment: null,
  initEnv: null,
  html: null,

  init: function(){
    Node.prototype.init.call(this);

    this.element = iframeProto.cloneNode(true);
    this.element.src = this.getSrc();
    this.element.onload = this.ready_.bind(this);
    basis.doc.body.add(this.element);
  },

  getSrc: function(){
    if (this.html && this.html != 'default')
      return this.html;

    // default env
    var baseURI = basis.config.runnerBaseURI || '';
    return basis.path.resolve(baseURI, asset('./iframe.html'));
  },

  ready_: function(){
    var frameWindow = this.element.contentWindow;
    var initCode = '';
    var code = require('./iframe_inject.code');

    if (typeof code == 'function')
      code = fnInfo(code).body;

    runInContext(frameWindow, code);

    if (typeof this.initEnv == 'function')
      initCode = fnInfo(this.initEnv).body;

    this.applyEnvironment = frameWindow.__initTestEnvironment(initCode, function(){
      // env deprecates
      this.destroy();
    }.bind(this));

    if (this.runArgs)
    {
      this.run.apply(this, this.runArgs);
      this.runArgs = null;
    }
  },

  run: function(code, context, runTest){
    if (this.applyEnvironment)
      runTest.call(context, this.applyEnvironment(code));
    else
      this.runArgs = arguments;
  },

  destroy: function(){
    Node.prototype.destroy.call(this);

    if (this.element.parentNode)
      this.element.parentNode.removeChild(this.element);
    this.element = null;

    this.applyEnvironment = null;
    this.runArgs = null;
  }
});

module.exports = FrameEnv;
