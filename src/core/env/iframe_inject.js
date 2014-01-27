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

function __initTestEnvironment(initCode, deprecateTestEnvironment){
  // basis.js default behaviour
  if (typeof basisjsToolsFileSync != 'undefined')
    basisjsToolsFileSync.notifications.attach(function(type, filename){
      if (typeof basis == 'undefined')
        return; // no basis.js available

      if (type == 'update' && (
            basis.filename_ == filename ||
            (basis.resource && basis.resource.exists(filename))
         ))
        deprecateTestEnvironment();
    });

  // fallback deprecate function
  if (typeof deprecateTestEnvironment != 'function')
    deprecateTestEnvironment = function(){};

  // main part
  return eval(initCode + ';(function(__code){\n' +
  '  return eval("(" + __code + ")");' +
  '})');
}
