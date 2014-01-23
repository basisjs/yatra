require('core.test');
require('app.test');

var view = new app.test.TestSuiteNode({
  template: resource('template/view.tmpl'),
  binding: {
    type: ['rootChanged', function(node){
      if (node.root instanceof core.test.TestSuite)
        return 'suite';
      if (node.root instanceof core.test.TestCase)
        return 'case';
      return 'unknown';
    }],
    sourceCode: 'satellite:',
    hasDelegate: ['delegateChanged', function(node){
      return !!node.delegate;
    }]
  },

  selection: true,
  satellite: {
    sourceCode: {
      instanceOf: app.test.CodeView,
      events: 'rootChanged stateChanged',
      existsIf: function(owner){
        return owner.root instanceof core.test.TestCase;
      },
      delegate: function(owner){
        return owner.state == basis.data.STATE.ERROR &&
               owner.state.data instanceof basis.data.Object
                  ? owner.state.data
                  : owner;
      }
    }
  }
});

// make view adds to it's own selection on select
// funny but that works
view.contextSelection = view.selection;
view.addHandler({
  delegateChanged: function(){
    this.selection.clear();
  }
});

module.exports = view;
