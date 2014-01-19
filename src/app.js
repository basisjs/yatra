require('basis.app');
require('basis.ui');

var highlight = require('basis.utils.highlight').highlight;
var Test = require('./testCls.js');
var runner = require('./runner.js');

var api = {
  loadTests: function(data){
    this.root.satellite.tests.setChildNodes(data.map(function(item){
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
      template: '<div><button event-click="run">run</button><!--{tests}--></div>',
      action: {
        run: function(){
          runner.run(this.satellite.tests.childNodes.map(function(item){
            return item.root;
          }));
        }
      },
      binding: {
        tests: new basis.ui.Node({
          childClass: {
            childClass: basis.Class.SELF,
            dataSource: basis.data.Value.factory('delegateChanged', function(node){
              return node.delegate && node.delegate.getChildNodesDataset();
            }),

            template: '<li>{name}: {state} ({stateData})<!--{source}--><ul{childNodesElement}/></li>',
            binding: {
              name: 'data:name',
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
                  return owner.root.test !== null &&
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
                        return '<div>' +
                          '<b>Expects:</b>' +
                          '<span class="expect">' + lineError.answerStr + '</span>' +
                          '<b>Result:</b>' +
                          '<span class="answer">' + lineError.resultStr + '</span>' +
                        '</div>';
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
        })
      }
    });
  }
});
