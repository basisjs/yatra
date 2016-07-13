var strDiff = require('diff');

function htmlEscape(str){
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

var annotationByType = {
  unknown: function(annotation){
    return '<div>Unknown annotation type: ' + annotation.type + '</div>';
  },
  compare: function(annotation){
    var diffType =
      typeof annotation.expected == 'string' &&
      typeof annotation.actual == 'string'
        ? 'diffChars'
        : 'diffWords';

    var diff = strDiff[diffType](annotation.expectedStr, annotation.actualStr);
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
      '<div class="error-line-details-item" event-click="debug" data-debug="' + annotation.debug + '">' +
        '<span class="num">' + (annotation.num + 1) + '</span>' +
        '<span class="caption">Expected:</span>' +
        '<span class="expected">' + expected + '</span>' +
        '<span class="caption">Actual:</span>' +
        '<span class="actual">' + actual + '</span>' +
      '</div>'
    );
  },
  message: function(annotation){
    return '<div class="error-line-details-item" event-click="debug" data-debug="' + annotation.debug + '">' +
      '<span>' + annotation.message + '</span>' +
    '</div>';
  }
};

module.exports = function processAnnotation(annotation){
  var fn = annotationByType[annotation.type] || annotationByType.unknown;

  return fn(annotation);
};
