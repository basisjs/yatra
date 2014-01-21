require('basis.ui');

module.exports = new basis.ui.Node({
  template: resource('template/toc.tmpl'),

  selection: true,
  childClass: {
    template: resource('template/toc-item.tmpl'),
    binding: {
      name: 'data:',
      progress: ['stateChanged', function(node){
        return 100 * (node.state == basis.data.STATE.PROCESSING ? node.state.data : 1);
      }],
      stateMessage: ['stateChanged', function(node){
        switch (String(node.state))
        {
          case basis.data.STATE.READY:
            return 'OK';

          case basis.data.STATE.ERROR:
            var report = node.state.data;
            return report instanceof basis.data.Object
              ? (report.data.testCount - report.data.successCount) + ' of ' + report.data.testCount + ' fault'
              : 'Error';

          case basis.data.STATE.PROCESSING:
            return 'running';

          default:
            return '';
        }
      }]
    }
  }
});
