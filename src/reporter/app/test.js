var Value = require('basis.data').Value;
var DataObject = require('basis.data').Object;
var STATE = require('basis.data').STATE;
var Node = require('basis.ui').Node;


//
// import names
//

var document = global.document;
var checkDebugger = require('./check-debugger.js');
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

var CodeView = Node.subclass({
  template: resource('./template/test-source.tmpl'),
  binding: {
    beforeCode: 'beforeElement',
    beforeCount: {
      events: 'rootChanged update',
      getter: function(node){
        return node.getBeforeAfterInfo().beforeCount;
      }
    },
    beforeCollapsed: 'beforeCollapsed',
    sourceCode: 'mainElement',
    afterCode: 'afterElement',
    afterCount: {
      events: 'rootChanged update',
      getter: function(node){
        return node.getBeforeAfterInfo().afterCount;
      }
    },
    afterCollapsed: 'afterCollapsed',
    hasParent: {
      events: 'ownerChanged',
      getter: function(node){
        return Value.from(node.owner, 'parentChanged', function(owner){
          return owner.parentNode ? !owner.parentNode.isRootNode : false;
        });
      }
    }
  },
  action: {
    toggleBefore: function(){
      this.beforeCollapsed.set(!this.beforeCollapsed.value);
    },
    toggleAfter: function(){
      this.afterCollapsed.set(!this.afterCollapsed.value);
    },
    debug: function(event){
      var target = event.actionTarget;
      var debug = Number(target.getAttribute('data-debug'));
      var test = this.root instanceof TestCase ? this.root : this.data.test;

      checkDebugger();
      test.run(debug);
    }
  },

  init: function(){
    this.beforeElement = document.createElement('div');
    this.beforeCollapsed = new basis.Token(true);
    this.mainElement = document.createElement('div');
    this.afterElement = document.createElement('div');
    this.afterCollapsed = new basis.Token(true);
    Node.prototype.init.call(this);
    this.syncCode();
  },
  destroy: function(){
    this.lines = null;
    this.beforeElement = null;
    this.beforeCollapsed = null;
    this.mainElement = null;
    this.afterElement = null;
    this.afterCollapsed = null;
    Node.prototype.destroy.call(this);
  },
  emit_update: function(delta){
    Node.prototype.emit_update.call(this, delta);
    this.syncCode();
  },
  getSourceCode: function(){
    return this.root instanceof TestCase == false
      ? this.data.testSource
      : this.root.getSourceCode();
  },
  getBeforeAfterInfo: function(){
    return this.root instanceof TestCase == false
      ? this.data
      : this.root.getBeforeAfterInfo();
  },
  syncCode: function(){
    var sourceCode = this.getSourceCode();
    var beforeAfterInfo = this.getBeforeAfterInfo();

    this.mainElement.innerHTML = highlight(sourceCode, {
      keepFormating: true,
      noLineNumber: true
    });

    var lines = basis.array.from(this.mainElement.childNodes);

    if (this.data.exception)
    {
      var startLine = this.data.lastLine;

      if (beforeAfterInfo.beforeLines && startLine < beforeAfterInfo.beforeLines)
        this.beforeCollapsed.set(false);
      if (beforeAfterInfo.afterLines && startLine >= (lines.length - beforeAfterInfo.afterLines))
        this.afterCollapsed.set(false);

      lines[startLine++].className += ' exception-line';
      for (var i = startLine; i < lines.length; i++)
        lines[i].className += ' disabled-line';
    }
    else
    {
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
                '<div class="error-line-details-item" event-click="debug" data-debug="' + lineError.debug + '">' +
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

    if (beforeAfterInfo.afterLines)
    {
      this.afterElement.innerHTML = '';
      lines.slice(lines.length - beforeAfterInfo.afterLines).forEach(function(line){
        this.afterElement.appendChild(line);
      }, this);
    }

    if (beforeAfterInfo.beforeLines)
    {
      this.beforeElement.innerHTML = '';
      lines.slice(0, beforeAfterInfo.beforeLines).forEach(function(line){
        this.beforeElement.appendChild(line);
      }, this);
    }
  }
});


//
// Tree node classes
//

var TestNode = Node.subclass({
  template: resource('./template/test.tmpl'),
  binding: {
    name: 'data:',
    loc: ['update', function(node){
      return node.data.loc || '';
    }],
    hasOwnEnvironment: ['rootChanged', function(node){
      return node.root.hasOwnEnvironment();
    }],
    time: ['stateChanged', function(node){
      return node.state.data &&
             node.state.data.data &&
             node.state.data.data.time;
    }],
    errorMessage: ['stateChanged', function(node){
      return node.state == STATE.ERROR && node.state.data
             ? node.state.data.data.error
             : '';
    }],
    pending: ['stateChanged', function(node){
      return node.state.data instanceof DataObject &&
             Boolean(node.state.data.data.pending);
    }],
    stateData: ['stateChanged', function(node){
      return node.state == STATE.PROCESSING
             ? (100 * node.state.data || 0).toFixed(2)
             : (node.state.data instanceof DataObject && node.state.data.data.error) || '';
    }],
    stateMessage: ['stateChanged', function(node){
      var report = node.state.data;

      switch (String(node.state))
      {
        case STATE.READY:
          if (report instanceof DataObject)
          {
            if (report.data.pending)
              return 'Pending';
          }

          return 'OK';

        case STATE.ERROR:
          if (report instanceof DataObject == false)
            return 'Error';

          if (report.data.exception)
            return report.data.exception;

          if (report.data.error == 'ERROR_TIMEOUT')
            return 'Timeout';

          return (report.data.testCount - report.data.successCount) + ' of ' + report.data.testCount + ' fault';

        case STATE.PROCESSING:
          return 'running';

        default:
          return '';
      }
    }]
  },
  action: {
    openLoc: function(){
      if (this.data.loc)
        require('app').notifyLoader('loc', this.data.loc);
    }
  }
});

var TestSuiteNode = TestNode.subclass({
  dataSource: Value.factory('rootChanged', function(node){
    return node.root ? node.root.getChildNodesDataset() : null;
  }),

  template: resource('./template/test-suite.tmpl'),

  sorting: 'root.basisObjectId',
  childClass: TestNode,
  childFactory: function(config){
    if (config.delegate.data.type == 'case')
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
        return owner.state == STATE.ERROR &&
               owner.state.data instanceof DataObject &&
               owner.state.data.data.testSource;
      },
      delegate: 'state.data',
      satelliteClass: CodeView
    }
  }
});

module.exports = {
  TestNode: TestNode,
  TestCaseNode: TestCaseNode,
  TestSuiteNode: TestSuiteNode,
  CodeView: CodeView
};
