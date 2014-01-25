require('basis.app');
require('basis.ui');
require('core.test');

var runner = require('core.runner');
var rootTestSuite = new basis.data.Object({
  getChildNodesDataset: function(){}
});

module.exports = basis.app.create({
  title: 'Basis.js test environment',
  init: function(){
    var toc = require('module/toc/index.js');
    var testDetails = require('module/test-tree/index.js');

    function findTestByFilename(test, filename){
      if (test.data.filename_ === filename)
        return test;

      if (test.childNodes)
        for (var i = 0, child; child = test.childNodes[i]; i++)
        {
          var res = findTestByFilename(child, filename);
          if (res)
            return res;
        }
    }

    // app API
    basis.object.extend(this, {
      loadTests: function(data){
        if (Array.isArray(data))
          data = { test: data };

        var rootTest = core.test.create(data);
        var filename = location.hash.substr(1);
        var testByFilename;

        if (filename)
          testByFilename = findTestByFilename(rootTest, filename);

        toc.setDelegate(testByFilename || rootTestSuite);
        rootTestSuite.setDelegate(rootTest);
      }
    });

    // table of content setup
    toc.setDelegate(rootTestSuite);
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
    return this.root = new basis.ui.Node({
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
  }
});
