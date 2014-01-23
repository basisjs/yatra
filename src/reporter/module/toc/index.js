require('basis.ui');

var runner = require('core.runner');
var Item = basis.ui.Node.subclass({
  template: resource('template/toc-item.tmpl'),
  binding: {
    name: 'data:',
    progress: ['stateChanged', function(node){
      return 100 * (node.state == basis.data.STATE.PROCESSING ? node.state.data : 1);
    }],
    stateMessage: ['stateChanged', function(node){
      switch (String(node.state))
      {
        case basis.data.STATE.READY:
          return 'OK';

        case basis.data.STATE.ERROR:
          var report = node.state.data;
          return report instanceof basis.data.Object
            ? (report.data.testCount - report.data.successCount) + ' of ' + report.data.testCount + ' fault'
            : 'Error';

        case basis.data.STATE.PROCESSING:
          return 'running';

        default:
          return '';
      }
    }]
  },
  action: {
    pickup: function(event){
      if (this.parentNode && this.root instanceof core.test.TestSuite)
        this.parentNode.setDelegate(this.root);
    }
  }
});

//
// main view
//
var view = new basis.ui.Node({
  dataSource: basis.data.Value.factory('rootChanged', function(node){
    return node.root.getChildNodesDataset();
  }),

  template: resource('template/toc.tmpl'),
  binding: {
    faultTests: 'satellite:',
    levelUp: 'satellite:'
  },

  selection: true,
  listen: {
    selection: {
      itemsChanged: function(selection){
        if (!selection.itemCount)
          this.satellite.faultTests.select();
      }
    }
  },

  childClass: Item
});

//
// special toc item that show failure list
//
view.setSatellite('faultTests', new Item({
  contextSelection: view.selection,  // make node selectable as regular view item
  delegate: new basis.data.Object({  // hack: test details view resolve test
    data: {                          // content as `root.getChildNodesDataset()`
      name: 'Fails'
    },
    getChildNodesDataset: function(){
      return runner.faultTests;
    }
  })
}));

//
// special toc item that level up tests
//
view.setSatellite('levelUp', {
  events: 'rootChanged',
  existsIf: function(owner){
    return owner.root.parentNode;
  },
  delegate: function(owner){
    return owner.root.parentNode;
  },
  instance: new Item({
    binding: {
      name: function(){
        return '..';
      }
    },
    action: {
      select: function(){
        this.owner.setDelegate(this.root);
      }
    }
  })
});

app.ready(function(){
  if (!view.selection.itemCount)
    view.satellite.faultTests.select();
});

module.exports = view;
