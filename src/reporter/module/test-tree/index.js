require('basis.data');
require('basis.ui');


//
// import names
//

var document = global.document;
var highlight = require('basis.utils.highlight').highlight;
var TestCase = require('core.test').TestCase;


//
// Tree node classes
//

var TestNode = basis.ui.Node.subclass({
  template: resource('template/test.tmpl'),
  binding: {
    name: 'data:',
    hasOwnEnvironment: ['rootChanged', function(node){
      return node.root.hasOwnEnvironment();
    }],
    time: ['stateChanged', function(node){
      return node.state.data && node.state.data.data && node.state.data.data.time;
    }],
    state: ['stateChanged', 'state'],
    stateData: ['stateChanged', function(node){
      return node.state == basis.data.STATE.PROCESSING
             ? (100 * node.state.data || 0).toFixed(2)
             : (node.state.data && node.state.data.data.error) || '';
    }]
  }
});

var TestSuiteNode = TestNode.subclass({
  dataSource: basis.data.Value.factory('rootChanged', function(node){
    return node.root && node.root.getChildNodesDataset();
  }),

  template: resource('template/test-suite.tmpl'),

  childClass: TestNode,
  childFactory: function(config){
    if (config.delegate.root instanceof TestCase)
      return new TestCaseNode(config);
    else
      return new TestSuiteNode(config);
  }
});

var TestCaseNode = TestNode.subclass({
  template: resource('template/test-case.tmpl'),
  binding: {
    source: 'satellite:'
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
                  '<b>Expected:</b>' +
                  '<span class="expect">' + lineError.answerStr + '</span>' +
                  '<b>Actual:</b>' +
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
});


//
// Main view
//

module.exports = new TestSuiteNode({
  template: resource('template/view.tmpl')
});
