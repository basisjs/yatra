require('basis.utils.info');
require('basis.ui');

function runInContext(contextWindow, code){
  (contextWindow.execScript || function(code){
    contextWindow['eval'].call(contextWindow, code);
  })(code);
}

var FrameEnv = basis.ui.Node.subclass({
  applyEnvironment: null,
  initEnv: null,
  html: null,

  postInit: function(){
    basis.ui.Node.prototype.postInit.call(this);
    basis.doc.body.add(this.element);
    //console.log('env created');
  },

  template:
    '<iframe src="{src}"' +
      ' event-load="ready"' +
      ' style="width: 10px; height: 10px; top: -100px; position: absolute; border: none; opacity: 0.0001"/>',
  binding: {
    src: function(node){
      if (node.html && node.html != 'default')
        return node.html;

      // default env
      return basis.asset(__dirname + 'iframe.html');
    }
  },
  action: {
    ready: function(){
      var frameWindow = this.element.contentWindow;
      var initCode = '';

      if (typeof this.initEnv == 'function')
        initCode = basis.utils.info.fn(this.initEnv).body
          .replace(/^([\r\n]|\s)*"use strict";/, '');  // Firefox adds "use strict" at the begining of function body

      runInContext(frameWindow, resource('iframe_inject.js').get(true));

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
    basis.ui.Node.prototype.destroy.call(this);
    this.applyEnvironment = null;
    this.runArgs = null;
    //console.log('env destroyed');
  }
});

module.exports = FrameEnv;
