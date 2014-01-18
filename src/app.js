require('basis.app');
require('basis.ui');

var Test = require('./testCls.js');
var runner = require('./runner.js');

var api = {
  loadTests: function(data){
    this.root.satellite.tests.setChildNodes(data.map(function(item){
      return new Test({
        data: item
      });
    }));
  }
};

module.exports = basis.app.create({
  title: 'Basis.js test environment',
  init: function(){
    basis.object.extend(this, api);

    return this.root = new basis.ui.Node({
      container: document.body,
      template: '<div><button event-click="run">run</button><!--{tests}--></div>',
      action: {
        run: function(){
          runner.run(this.satellite.tests.childNodes.map(function(item){
            return item.root;
          }));
        }
      },
      binding: {
        tests: new basis.ui.Node({
          childClass: {
            childClass: basis.Class.SELF,
            dataSource: basis.data.Value.factory('delegateChanged', function(node){
              return node.delegate && node.delegate.getChildNodesDataset();
            }),

            template: '<li>{name}: {state} ({stateData})<ul{childNodesElement}/></li>',
            binding: {
              name: 'data:name',
              state: ['stateChanged', 'state'],
              stateData: ['stateChanged', function(node){
                return node.state == basis.data.STATE.PROCESSING
                  ? (100 * node.state.data || 0).toFixed(2)
                  : (node.state.data && node.state.data.data.error) || '';
              }]
            }
          }
        })
      }
    });
  }
});
