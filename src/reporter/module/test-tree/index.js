require('app.test');

module.exports = new app.test.TestSuiteNode({
  template: resource('template/view.tmpl'),
  binding: {
    hasDelegate: ['delegateChanged', function(node){
      return !!node.delegate;
    }]
  }
});
