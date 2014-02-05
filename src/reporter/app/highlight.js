
 /**
  * @namespace basis.utils.highlight
  */

  var lead = basis.number.lead;
  var repeat = basis.string.repeat;


  //
  // simple javascript parser
  //

  var keywords =
    'break case catch continue ' +
    'default delete do else false ' +
    'for function if in instanceof ' +
    'new null return super switch ' +
    'this throw true try typeof var while with';

  var keywordRegExp = new RegExp('\\b(' + keywords.split(' ').join('|') + ')\\b', 'g');

  function parse(text){
    function addMatch(kind, start, end, rn){
      if (lastMatchPos != start)
        result.push(text.substring(lastMatchPos, start).replace(keywordRegExp, '<span class="token-keyword">$1</span>'));

      lastMatchPos = end + 1;

      if (kind)
        result.push('<span class="token-' + kind + '">' + text.substring(start, end + 1) + '</span>' + (rn || ''));
    }

    var result = [];
    var sym = text.split('');
    var start;
    var lastMatchPos = 0;
    var strSym;

    for (var i = 0; i < sym.length; i++)
    {
      if (sym[i] == '\'' || sym[i] == '\"')
      {
        strSym = sym[i];
        start = i;
        while (++i < sym.length)
        {
          if (sym[i] == '\\')
          {
            if (sym[i + 1] == '\n')
            {
              addMatch('string', start, i);
              start = ++i + 1;
            }
            else
              i += 2;
          }

          if (sym[i] == strSym)
          {
            addMatch('string', start, i);
            break;
          }

          if (sym[i] == '\n')
            break;
        }
      }
      else if (sym[i] == '/')
      {
        start = i;
        i++;

        if (sym[i] == '/')
        {
          while (++i < sym.length)
          {
            if (sym[i] == '\n')
              break;
          }

          addMatch('comment', start, i - 1);
        }
        else if (sym[i] == '*')
        {
          while (++i < sym.length)
          {
            if (sym[i] == '*' && sym[i + 1] == '/')
            {
              addMatch('comment', start, ++i);
              break;
            }
            else if (sym[i] == '\n')
            {
              addMatch('comment', start, i - 1, '\n');
              lastMatchPos = start = i + 1;
            }
          }
        }
      }
    }

    addMatch(null, text.length);

    return result;
  };


 /**
  * Function that produce html code from text.
  * @param {string} text
  * @param {object=} options
  * @return {string}
  */
  function highlight(text, options){

    function normalize(text){
      text = text
        .trimRight()
        .replace(/\r\n|\n\r|\r/g, '\n');

      if (!options.keepFormat)
        text = text.replace(/^(?:\s*[\n]+)+?([ \t]*)/, '$1');

      // fix empty strings
      text = text
               .replace(/\n[ \t]+/g, function(m){
                  return m.replace(/\t/g, '  ');
                })
               .replace(/\n[ \t]+\n/g, '\n\n');

      if (!options.keepFormat)
      {
        // normalize text offset
        var minOffset = 1000;
        var lines = text.split(/\n+/);
        var startLine = Number(text.match(/^function/) != null); // fix for function.toString()
        for (var i = startLine; i < lines.length; i++)
        {
          var m = lines[i].match(/^\s*/);
          if (m[0].length < minOffset)
            minOffset = m[0].length;
          if (minOffset == 0)
            break;
        }

        if (minOffset > 0)
          text = text.replace(new RegExp('(^|\\n) {' + minOffset + '}', 'g'), '$1');
      }

      text = text.replace(new RegExp('(^|\\n)( +)', 'g'), function(m, a, b){
        return a + repeat('\xA0', b.length);
      });

      return text;
    }

    //  MAIN PART

    if (!options)
      options = {};

    var html = parse(normalize(text || '').replace(/</g, '&lt;'));

    var lines = html.join('').split('\n');
    var numberWidth = String(lines.length).length;
    var lineClass = options.noLineNumber ? '' : ' hasLineNumber';
    var res = [];

    for (var i = 0; i < lines.length; i++)
      res.push(
        '<div class="line ' + (i % 2 ? 'odd' : 'even') + lineClass + '">' +
          '<span class="lineContent">' +
            (!options.noLineNumber
              ? '<input class="lineNumber" value="' + lead(i + 1, numberWidth) + '" type="none" unselectable="on" readonly="readonly" tabindex="-1" />' +
                '<span class="over"></span>'
              : ''
            ) +
            (lines[i] + '\r\n') +
          '</span>' +
        '</div>'
      );

    return res.join('');
  }


  //
  // export names
  //

  module.exports = highlight;
