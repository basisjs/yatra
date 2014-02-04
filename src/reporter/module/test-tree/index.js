var coreTest = require('core.test');
var appTest = require('app.test');

var view = new appTest.TestSuiteNode({
  template: resource('template/view.tmpl'),
  binding: {
    sourceCode: 'satellite:',
    type: ['rootChanged', function(node){
      if (node.root instanceof coreTest.TestSuite)
        return 'suite';
      if (node.root instanceof coreTest.TestCase)
        return 'case';
      return 'unknown';
    }],
    hasDelegate: ['delegateChanged', function(node){
      return !!node.delegate;
    }]
  },

  selection: true,
  satellite: {
    sourceCode: {
      instanceOf: appTest.CodeView,
      events: 'rootChanged stateChanged',
      existsIf: function(owner){
        return owner.root instanceof coreTest.TestCase;
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
