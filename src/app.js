require('basis.app');
require('basis.ui');

var Test = require('./testCls.js');
var runner = require('./runner.js');

var tests = new basis.data.Dataset();
var api = {
  loadTests: function(data){
    tests.set(data.map(function(item){
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
      template: resource('template/view.tmpl'),
      action: {
        run: function(){
          runner.run(this.satellite.tests.childNodes.map(function(item){
            return item.root;
          }));
        }
      },
      binding: {
        progress: new basis.ui.Node({
          template: '<div>{done} / {total}</div>',
          binding: {
            total: runner.count.total,
            left: runner.count.left,
            done: runner.count.done
          }
        }),
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
