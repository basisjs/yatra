require('basis.data');
require('basis.ui');


//
// import names
//

var document = global.document;
var highlight = require('basis.utils.highlight').highlight;
var TestCase = require('core.test').TestCase;


//
// Test source code view
//

var CodeView = basis.ui.Node.subclass({
  template: resource('template/test-source.tmpl'),
  binding: {
    sourceCode: 'codeElement'
  },

  init: function(){
    this.codeElement = document.createElement('div');
    basis.ui.Node.prototype.init.call(this);
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
      this.codeElement.childNodes[line - 1].className += ' error-line';
      this.codeElement.childNodes[line - 1].innerHTML +=
        '<div class="error-line-details">' +
          errorLines[line].map(function(lineError){
            return (
              '<div class="error-line-details-item">' +
                '<span class="caption">Expected:</span>' +
                '<span class="expected">' + lineError.answerStr + '</span>' +
                '<span class="caption">Actual:</span>' +
                '<span class="actual">' + lineError.resultStr + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>';
    }
  },
  handler: {
    update: function(){
      this.syncCode();
    }
  }
});


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
    }],
    stateData: ['stateChanged', function(node){
      return node.state == basis.data.STATE.PROCESSING
             ? (100 * node.state.data || 0).toFixed(2)
             : (node.state.data && node.state.data.data.error) || '';
    }]
  }
});

var TestSuiteNode = TestNode.subclass({
  dataSource: basis.data.Value.factory('rootChanged', function(node){
    return node.root.getChildNodesDataset();
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
        return owner.state == basis.data.STATE.ERROR &&
               owner.state.data &&
               owner.state.data.data &&
               owner.state.data.data.testSource;
      },
      delegate: 'state.data',
      instanceOf: CodeView
    }
  }
});

module.exports = {
  TestNode: TestNode,
  TestCaseNode: TestCaseNode,
  TestSuiteNode: TestSuiteNode,
  CodeView: CodeView
};
