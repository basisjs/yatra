require('basis.data');
require('basis.ui');


//
// import names
//

var document = global.document;
var highlight = require('app.highlight');
var TestCase = require('core.test').TestCase;
var strDiff = require('diff');


//
// Test source code view
//

function htmlEscape(str){
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

var CodeView = basis.ui.Node.subclass({
  template: resource('./template/test-source.tmpl'),
  binding: {
    sourceCode: 'codeElement'
  },

  init: function(){
    this.codeElement = document.createElement('div');
    basis.ui.Node.prototype.init.call(this);
    this.syncCode();
  },
  handler: {
    update: function(){
      this.syncCode();
    }
  },
  syncCode: function(){
    this.codeElement.innerHTML = highlight(this.data.testSource, {
      keepFormat: true,
      noLineNumber: true
    });

    var lines = this.codeElement.childNodes;
    if (this.data.exception)
    {
      var startLine = this.data.lastLine;

      lines[startLine++].className += ' exception-line';
      for (var i = startLine; i < lines.length; i++)
        lines[i].className += ' disabled-line';

      return;
    }

    var errorLines = this.data.errorLines;
    for (var lineNum in errorLines)
    {
      lines[lineNum].className += ' error-line';
      lines[lineNum].innerHTML +=
        '<div class="error-line-details">' +
          errorLines[lineNum].map(function(lineError){
            var diffType =
              typeof lineError.expected == 'string' &&
              typeof lineError.actual == 'string'
                ? 'diffChars'
                : 'diffWords';

            var diff = strDiff[diffType](lineError.expectedStr, lineError.actualStr);
            var expected = '';
            var actual = '';

            for (var i = 0, chunk; chunk = diff[i]; i++)
            {
              if (chunk.removed)
              {
                expected += '<span class="diff-removed">' + htmlEscape(chunk.value) + '</span>';
                continue;
              }

              if (chunk.added)
              {
                actual += '<span class="diff-added">' + htmlEscape(chunk.value) + '</span>';
                continue;
              }

              expected += htmlEscape(chunk.value);
              actual += htmlEscape(chunk.value);
            }

            return (
              '<div class="error-line-details-item">' +
                '<span class="num">' + (lineError.num + 1) + '</span>' +
                '<span class="caption">Expected:</span>' +
                '<span class="expected">' + expected + '</span>' +
                '<span class="caption">Actual:</span>' +
                '<span class="actual">' + actual + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>';
    }
  }
});


//
// Tree node classes
//

var TestNode = basis.ui.Node.subclass({
  template: resource('./template/test.tmpl'),
  binding: {
    name: 'data:',
    hasOwnEnvironment: ['rootChanged', function(node){
      return node.root.hasOwnEnvironment();
    }],
    time: ['stateChanged', function(node){
      return node.state.data && node.state.data.data && node.state.data.data.time;
    }],
    errorMessage: ['stateChanged', function(node){
      return node.state == basis.data.STATE.ERROR && node.state.data
        ? node.state.data.data.error
        : '';
    }],
    pending: ['stateChanged', function(node){
      return node.state.data instanceof basis.data.Object && !!node.state.data.data.pending;
    }],
    stateData: ['stateChanged', function(node){
      return node.state == basis.data.STATE.PROCESSING
             ? (100 * node.state.data || 0).toFixed(2)
             : (node.state.data && node.state.data.data.error) || '';
    }],
    stateMessage: ['stateChanged', function(node){
      var report = node.state.data;

      switch (String(node.state))
      {
        case basis.data.STATE.READY:
          if (report instanceof basis.data.Object)
          {
            if (report.data.pending)
              return 'Pending';
          }

          return 'OK';

        case basis.data.STATE.ERROR:
          if (report instanceof basis.data.Object == false)
            return 'Error';

          if (report.data.exception)
            return report.data.exception;

          if (report.data.error == 'ERROR_TIMEOUT')
            return 'Timeout';

          return (report.data.testCount - report.data.successCount) + ' of ' + report.data.testCount + ' fault';

        case basis.data.STATE.PROCESSING:
          return 'running';

        default:
          return '';
      }
    }]
  }
});

var TestSuiteNode = TestNode.subclass({
  dataSource: basis.data.Value.factory('rootChanged', function(node){
    return node.root.getChildNodesDataset();
  }),

  template: resource('./template/test-suite.tmpl'),

  childClass: TestNode,
  childFactory: function(config){
    if (config.delegate.root instanceof TestCase)
      return new TestCaseNode(config);
    else
      return new TestSuiteNode(config);
  }
});

var TestCaseNode = TestNode.subclass({
  template: resource('./template/test-case.tmpl'),
  binding: {
    source: 'satellite:'
  },

  satellite: {
    source: {
      events: 'stateChanged',
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
