var Value = require('basis.data').Value;
var DataObject = require('basis.data').Object;
var STATE = require('basis.data').STATE;
var Node = require('basis.ui').Node;


//
// import names
//

var document = global.document;
var checkDebugger = require('./check-debugger.js');
var highlight = require('./highlight.js');
var TestCase = require('runner.test').TestCase;
var processAnnotation = require('./annotations.js');

//
// Test source code view
//


var CodeView = Node.subclass({
  className: 'CodeView',

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
    openLoc: function(e){
      var loc = e.sender.getAttribute('data-loc');
      if (loc)
        require('app').notifyLoader('loc', loc);
    },
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
    var exception = this.data.exception;

    if (exception)
    {
      var startLine = this.data.lastLine;

      if (beforeAfterInfo.beforeLines && startLine < beforeAfterInfo.beforeLines)
        this.beforeCollapsed.set(false);
      if (beforeAfterInfo.afterLines && startLine >= (lines.length - beforeAfterInfo.afterLines))
        this.afterCollapsed.set(false);

      lines[startLine++].className += ' exception-line';
      for (var i = startLine; i < lines.length; i++)
        lines[i].className += ' disabled-line';

      var stack = exception.stack;
      if (stack)
      {
        var stackEl = document.createElement('div');
        var host = location.protocol + '//' + location.host;
        var message = String(exception);

        // cut off everything before __yatra_test__
        stack = stack
          .split(/(\n[^\n]*__yatra_test__[^\n]*)/);
        stack = stack
          .slice(0, stack.length - 2)
          .join('');

        if (message && stack.split('\n')[0] !== message)
          stack = message + '\n' + stack;

        stack = stack
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quote;')
          .replace(/</g, '&lt;')
          .replace(/\n\s*(at\s+)?(?!$)/g, '\n    ')
          .replace(new RegExp(host + '(/[^\\s)]+)', 'gi'), '<span class="loc-link" data-loc="$1">$1</span>');

        stackEl.className = 'exception-details';
        stackEl.innerHTML = stack;
        this.mainElement.insertBefore(stackEl, lines[startLine]);
      }
    }
    else
    {
      var errorLines = this.data.errorLines;
      var noLine = document.createElement('div');

      // no line annotations
      noLine.className = 'line';
      lines.push(noLine);

      for (var lineNum in errorLines)
      {
        lines[lineNum].className += ' error-line';
        lines[lineNum].innerHTML +=
          '<div class="error-line-details">' +
            errorLines[lineNum].map(processAnnotation).join('') +
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
  className: 'TestNode',

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
  className: 'TestSuiteNode',

  dataSource: Value.factory('rootChanged', function(node){
    return node.root ? node.root.getChildNodesDataset() : null;
  }).deferred(),  // TODO: investigate why deferred() fixes issue with section selection

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
  className: 'TestCaseNode',

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
      instance: CodeView
    }
  }
});

module.exports = {
  TestNode: TestNode,
  TestCaseNode: TestCaseNode,
  TestSuiteNode: TestSuiteNode,
  CodeView: CodeView
};
