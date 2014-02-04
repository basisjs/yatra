require('basis.app');
require('basis.ui');

var runner = require('core.runner');
var toc = require('module/toc/index.js');
var testDetails = require('module/test-tree/index.js');
var rootTestSuite = new basis.data.Object({
  getChildNodesDataset: function(){
    // stub method
  }
});

function findTest(test, filename){
  if (test.data.filename_ === filename)
    return test;

  if (test.childNodes)
    for (var i = 0, child; child = test.childNodes[i]; i++)
    {
      var res = findTest(child, filename);
      if (res)
        return res;
    }
}

basis.ready(function(){
  // table of content setup
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
      runner.loadTests(this.childNodes.slice(0));
    }
  });
  toc.selection.addHandler({
    itemsChanged: function(selection){
      this.setDelegate(selection.pick());
    }
  }, testDetails);

  // content section setup
  testDetails.selection.addHandler({
    itemsChanged: function(selection){
      var selected = selection.pick();
      if (selected)
        this.setDelegate(selected.root);
    }
  }, toc);

  // return interface root
  new basis.ui.Node({
    container: document.body,
    template: resource('template/view.tmpl'),
    action: {
      reset: function(){
        toc.setDelegate(rootTestSuite);
      },
      run: function(){
        runner.run();
      }
    },
    binding: {
      time: runner.time,
      total: runner.count.total,
      assert: runner.count.assert,
      left: runner.count.left,
      done: runner.count.done,
      toc: toc,
      tests: testDetails
    }
  });
});

module.exports = {
  loadTests: function(data, reference){
    if (Array.isArray(data))
      data = { test: data };

    var rootTest = require('core.test').create(data);
    var filename = location.hash.substr(1);
    var testByFilename;

    if (filename)
      testByFilename = findTest(rootTest, filename);

    toc.setDelegate(testByFilename || rootTestSuite);
    rootTestSuite.setDelegate(rootTest);
  }
};

if (basis.config.exports)
  basis.nextTick(function(){
    basis.require(basis.config.exports);
  });
