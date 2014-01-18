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
  },

  template:
    '<iframe src="{src}"' +
      ' event-load="ready"' +
      ' style="width: 10px; height: 10px; position: absolute; border: none; opacity: 0.0001"/>',
  binding: {
    src: function(node){
      return node.html || basis.asset('src/env/iframe.html');
    }
  },
  action: {
    ready: function(){
      var frameWindow = this.element.contentWindow;

      runInContext(frameWindow,
        resource('iframe_inject.js').get(true) +
        (typeof this.initEnv == 'function'
          ? basis.utils.info.fn(this.initEnv).body
          : '')
      );

      this.applyEnvironment = frameWindow.Function;

      if (this.runArgs)
      {
        this.run.apply(this, this.runArgs);
        this.runArgs = null;
      }
    }
  },

  run: function(test, context, runTest){
    if (this.applyEnvironment)
      runTest.call(context, this.applyEnvironment(basis.utils.info.fn(test).body));
    else
      this.runArgs = arguments;
  }
});

module.exports = FrameEnv;
