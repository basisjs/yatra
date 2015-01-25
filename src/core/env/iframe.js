var fnInfo = require('basis.utils.info').fn;
var Node = require('basis.ui').Node;

function runInContext(contextWindow, code){
  (contextWindow.execScript || function(code){
    contextWindow['eval'].call(contextWindow, code);
  })(code);
}

var FrameEnv = Node.subclass({
  applyEnvironment: null,
  initEnv: null,
  html: null,

  postInit: function(){
    Node.prototype.postInit.call(this);
    basis.doc.body.add(this.element);
    //console.log('env created');
  },

  template: resource('./iframe.tmpl'),
  binding: {
    src: function(node){
      if (node.html && node.html != 'default')
        return node.html;

      // default env
      return basis.path.resolve((require('core.env').baseURI || ''), basis.asset(__dirname + 'iframe.html'));
    }
  },
  action: {
    ready: function(){
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
    this.applyEnvironment = null;
    this.runArgs = null;
    //console.log('env destroyed');
  }
});

module.exports = FrameEnv;
