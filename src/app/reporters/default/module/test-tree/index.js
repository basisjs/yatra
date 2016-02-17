var STATE = require('basis.data').STATE;
var DataObject = require('basis.data').Object;
var coreTest = require('runner.test');
var appTest = require('./test.js');

var view = new appTest.TestSuiteNode({
  template: resource('./template/view.tmpl'),
  binding: {
    sourceCode: 'satellite:',
    type: ['update', function(node){
      return node.data.type || 'unknown';
    }],
    hasDelegate: ['delegateChanged', function(node){
      return !!node.delegate;
    }]
  },

  isRootNode: true,
  selection: true,
  satellite: {
    sourceCode: {
      instance: appTest.CodeView,
      events: 'update stateChanged',
      existsIf: function(owner){
        return owner.data.type == 'case';
      },
      delegate: function(owner){
        return owner.state == STATE.ERROR &&
               owner.state.data instanceof DataObject
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
