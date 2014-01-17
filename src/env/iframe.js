require('basis.utils.info');
require('basis.ui');

var FrameEnv = basis.ui.Node.subclass({
  applyEnvironment: null,
  initEnv: null,

  postInit: function(){
    basis.ui.Node.prototype.postInit.call(this);
    basis.doc.body.add(this.element);
  },

  template:
    '<iframe' +
      ' src="' + basis.asset('src/env/iframe.html') + '"' +
      ' event-load="ready"' +
      ' srcdoc="' + require('./iframe.html').replace(/"/g, '&quote;') + '"' +
      ' style="width: 10px; height: 10px; border: none"/>',

  action: {
    ready: function(){
      this.applyEnvironment = this.element.contentWindow.initScope(
        basis.utils.info.fn(this.initEnv).body,
        this.initHtml,
        this.initCss
      );

      if (this.runArgs)
      {
        this.run.apply(this, this.runArgs);
        this.runArgs = null;
      }
    }
  },

  run: function(test, context, runTest){
    if (this.applyEnvironment)
      runTest.call(context, this.applyEnvironment(test));
    else
      this.runArgs = arguments;
  }
});

module.exports = FrameEnv;
