var STATE = require('basis.data').STATE;
var Value = require('basis.data').Value;
var DataObject = require('basis.data').Object;
var Node = require('basis.ui').Node;
var runner = require('runner');
var TestSuite = require('runner.test').TestSuite;

var Item = Node.subclass({
  template: resource('./template/toc-item.tmpl'),
  startTime: 0,
  progressTimer_: null,
  binding: {
    name: 'data:',
    progress: ['stateChanged', function(node){
      return node.state == STATE.PROCESSING ? 100 * node.state.data : 100;
    }],
    showProgress: ['stateChanged', function(node){
      return (Date.now() - node.startTime) > 500;
    }],
    pending: ['stateChanged', function(node){
      return node.state.data instanceof DataObject &&
             Boolean(node.state.data.data.pending);
    }],
    stateMessage: ['stateChanged', function(node){
      var report = node.state.data;

      switch (String(node.state))
      {
        case STATE.READY:
          if (report.data && report.data.pending)
            return 'Pending';

          return 'OK';

        case STATE.ERROR:
          if (report instanceof DataObject == false)
            return 'Error';

          if (report.data.exception)
            return 'Exception';

          if (report.data.error == 'ERROR_TIMEOUT')
            return 'Timeout';

          return (report.data.testCount - report.data.successCount) + ' of ' + report.data.testCount + ' fault';

        case STATE.PROCESSING:
          return 'running';

        default:
          return '';
      }
    }]
  },
  action: {
    pickup: function(event){
      if (this.parentNode && this.root instanceof TestSuite)
        this.parentNode.setDelegate(this.root);
    }
  },
  emit_stateChanged: function(oldState){
    if (this.state == STATE.PROCESSING && oldState != STATE.PROCESSING)
      this.startTime = Date.now();
    if (this.state != STATE.PROCESSING)
      this.startTime = 0;

    Node.prototype.emit_stateChanged.call(this, oldState);
  }
});

//
// main view
//
var view = new Node({
  dataSource: Value.factory('rootChanged', function(node){
    return node.root.getChildNodesDataset();
  }),

  template: resource('./template/toc.tmpl'),
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
  delegate: new DataObject({         // hack: test details view resolve test
    data: {                          // content as `root.getChildNodesDataset()`
      name: 'Summary'
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

basis.ready(function(){
  if (!view.selection.itemCount)
    view.satellite.faultTests.select();
});

module.exports = view;
