require('basis.app');
require('basis.ui');
require('core.test');

var runner = require('core.runner');

var tests = new basis.data.Dataset();
var api = {
  loadTests: function(data){
    tests.set(
      [new basis.data.Object({
        data: {
          name: 'Fault tests'
        },
        getChildNodesDataset: function(){
          return runner.faultTests;
        },
        run: function(){
          this.setState('ready');
        },
        reset: function(){}
      })].concat(data.map(core.test.create))
    );
  }
};

module.exports = basis.app.create({
  title: 'Basis.js test environment',
  init: function(){
    basis.object.extend(this, api);

    var toc = require('module/toc/index.js');
    var testDetails = require('module/test-tree/index.js');

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

    toc.setDataSource(tests);
    //testDetails.setDataSource(runner.faultTests);

    return this.root = new basis.ui.Node({
      container: document.body,
      template: resource('template/view.tmpl'),
      action: {
        run: function(){
          runner.run(toc.childNodes.slice(0));
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
