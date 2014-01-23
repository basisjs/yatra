require('basis.app');
require('basis.ui');
require('core.test');

var runner = require('core.runner');
var toc = require('module/toc/index.js');
var testDetails = require('module/test-tree/index.js');

var tests = new basis.data.Dataset();
var rootTestSuite;

var api = {
  loadTests: function(data){
    if (Array.isArray(data))
      data = { test: data };

    rootTestSuite = core.test.create(data);
    tests.set(rootTestSuite.childNodes);

    toc.setDelegate(rootTestSuite);
  }
};

module.exports = basis.app.create({
  title: 'Basis.js test environment',
  init: function(){
    basis.object.extend(this, api);

    toc.addHandler({
      childNodesModified: function(){
        runner.loadTests(this.childNodes.slice(0));
      }
    });
    toc.selection.addHandler({
      itemsChanged: function(selection){
        this.setDelegate(selection.pick());
      }
    }, testDetails);

    testDetails.selection.addHandler({
      itemsChanged: function(selection){
        var selected = selection.pick();
        if (selected)
          this.setDataSource(selected.root.getChildNodesDataset());
      }
    }, toc);

    toc.setDelegate(rootTestSuite);

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
        left: runner.count.left,
        done: runner.count.done,
        toc: toc,
        tests: testDetails
      }
    });
  }
});
