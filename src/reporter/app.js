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
        tests: 'satellite:'
      },
      satellite: {
        tests: {
          dataSource: function(){
            return tests;
          },
          instance: require('module/test-tree/index.js')
        }
      }
    });
  }
});
