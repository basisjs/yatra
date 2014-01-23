function importScripts(){
  function importScript(url){
    var req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.setRequestHeader('If-Modified-Since', new Date(0).toGMTString());
    req.send(null);

    if (req.status >= 200 && req.status < 400)
      (window.execScript || function(fn){
        window['eval'].call(window, fn);
      })(req.responseText);
    else
      throw 'Can\'t load script: ' + url;
  }

  for (var i = 0; i < arguments.length; i++)
    importScript(arguments[i])
}

var deprecateTestFunction;
function deprecateTestEnvironment(){
  if (typeof deprecateTestFunction == 'function')
    deprecateTestFunction();
}

function __initTestEnvironment(initCode, deprecateFn){
  deprecateTestFunction = deprecateFn;
  return eval(initCode + ';(function(__code){\n' +
  '  return eval("(" + __code + ")");' +
  '})');
}
