require('basis.data');
require('basis.ui');

var document = global.document;
var highlight = require('basis.utils.highlight').highlight;

module.exports = new basis.ui.Node({
  template: resource('template/view.tmpl'),

  childClass: {
    childClass: basis.Class.SELF,
    dataSource: basis.data.Value.factory('delegateChanged', function(node){
      return node.delegate && node.delegate.getChildNodesDataset();
    }),

    template: resource('template/test.tmpl'),
    binding: {
      name: 'data:',
      hasOwnEnvironment: ['rootChanged', function(node){
        return node.root.hasOwnEnvironment();
      }],
      source: 'satellite:',
      state: ['stateChanged', 'state'],
      stateData: ['stateChanged', function(node){
        return node.state == basis.data.STATE.PROCESSING
               ? (100 * node.state.data || 0).toFixed(2)
               : (node.state.data && node.state.data.data.error) || '';
      }]
    },
    satellite: {
      source: {
        events: 'update stateChanged',
        existsIf: function(owner){
          return owner.root.testSource &&
                 owner.state == basis.data.STATE.ERROR;
        },
        delegate: 'state.data',
        instanceOf: basis.ui.Node.subclass({
          template: resource('template/test-source.tmpl'),
          binding: {
            sourceCode: 'codeElement'
          },

          init: function(){
            basis.ui.Node.prototype.init.call(this);
            this.codeElement = document.createElement('div');
            this.syncCode();
          },
          syncCode: function(){
            this.codeElement.innerHTML = highlight(this.data.testSource, 'js', {
              keepFormat: true,
              noLineNumber: true
            });

            var errorLines = this.data.errorLines;
            for (var line in errorLines)
            {
              this.codeElement.childNodes[line - 1].innerHTML += errorLines[line].map(function(lineError){
                return (
                  '<div>' +
                    '<b>Expects:</b>' +
                    '<span class="expect">' + lineError.answerStr + '</span>' +
                    '<b>Result:</b>' +
                    '<span class="answer">' + lineError.resultStr + '</span>' +
                  '</div>'
                );
              }).join('');
            }
          },
          handler: {
            update: function(){
              this.syncCode();
            }
          }
        })
      }
    }
  }
});
