var Value = require('basis.data').Value;
var Expression = require('basis.data.value').Expression;
var Node = require('basis.ui').Node;
var runner = require('runner');
var toc = require('./module/toc/index.js');
var testTree = require('./module/test-tree/index.js');

var view = new Node({
  template: resource('./template/view.tmpl'),
  action: {
    reset: function(){
      toc.setDelegate(this);
    },
    run: function(){
      runner.run();
    }
  },
  binding: {
    // subview
    toc: toc,
    tests: testTree,

    runnerState: new Expression(
      runner.state,
      runner.count.total,
      runner.count.fault,
      runner.count.left,
      function(state, total, fault, left){
        if (fault)
          return 'fault';
        if (state != 'running' && total && !left)
          return 'ok';
        return state;
      }
    ),

    // values
    name: 'data:name',
    time: runner.time.as(function(val){
      return (val / 1000).toFixed(1);
    }),
    total: runner.count.total,
    assert: runner.count.assert,
    left: runner.count.left,
    done: runner.count.done
  }
});

// table of content setup
toc.setDelegate(view);
toc.addHandler({
  delegateChanged: function(){
    var cursor = this;

    while (!cursor.data.filename_ && cursor.root.parentNode)
      cursor = cursor.root.parentNode;

    location.hash = '#' + (
      cursor.root.parentNode && cursor.data.filename_
        ? cursor.data.filename_
        : ''
    );
  },
  childNodesModified: function(){
    runner.loadTests(this.childNodes.map(function(node){
      return node.root;
    }));
  }
});

// content section setup
testTree.setDelegate(Value.from(toc.selection, 'itemsChanged', 'pick()'));
testTree.selection.addHandler({
  itemsChanged: function(selection){
    var selected = selection.pick();
    if (selected)
      toc.setDelegate(selected.root);
  }
});

module.exports = view;

