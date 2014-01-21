require('basis.app');
require('basis.ui');
require('core.test');

var runner = require('core.runner');

var tests = new basis.data.Dataset();
var api = {
  loadTests: function(data){
    tests.set(data.map(core.test.create));
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

    return this.root = new basis.ui.Node({
      container: document.body,
      template: resource('template/view.tmpl'),
      action: {
        run: function(){
          runner.run(tests.getItems());
        }
      },
      binding: {
        time: runner.time,
        total: runner.count.total,
        left: runner.count.left,
        done: runner.count.done,
        toc: 'satellite:',
        tests: 'satellite:'
      },
      satellite: {
        toc: {
          instance: toc,
          dataSource: function(){
            return tests;
          }
        },
        tests: {
          instance: testDetails
        }
      }
    });
  }
});
