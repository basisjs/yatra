require('core.test');
require('app.test');

module.exports = new app.test.TestSuiteNode({
  template: resource('template/view.tmpl'),
  binding: {
    hasDelegate: ['delegateChanged', function(node){
      return !!node.delegate;
    }],
    sourceCode: 'satellite:'
  },

  selection: true,
  satellite: {
    sourceCode: {
      events: 'rootChanged stateChanged',
      existsIf: function(owner){
        return owner.root instanceof core.test.TestCase;
      },
      delegate: function(owner){
        return owner.state == basis.data.STATE.ERROR &&
               owner.state.data instanceof basis.data.Object
                  ? owner.state.data
                  : owner;
      },
      instanceOf: app.test.CodeView
    }
  }
});
