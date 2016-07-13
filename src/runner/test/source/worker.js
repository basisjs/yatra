/*eslint-env worker*/
/*global getFunctionInfo wrapSource*/
importScripts('./utils.js', './info.js');

onmessage = function(event){
  postMessage(
    event.data.map(function(data){
      var source = data.source;
      var breakPointAt = data.breakPointAt;
      var fnInfo = getFunctionInfo(source);
      var args = fnInfo.args;
      var body = fnInfo.body;

      //console.log('worker receive:', data);

      return {
        source: source,
        args: args,
        body: body,
        wrapped: wrapSource(body, breakPointAt)
      };
    })
  );
};
