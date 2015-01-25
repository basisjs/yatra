importScripts('./utils.js', './info.js');

onmessage = function(event){
  var queue = event.data;
  var result = [];

  for (var i = 0, data; data = queue[i]; i++)
  {
    var source = data.source;
    var breakPointAt = data.breakPointAt;
    var fnInfo = getFunctionInfo(source);
    var args = fnInfo.args;
    var body = fnInfo.body;

    //console.log('worker receive:', data);

    queue[i] = {
      source: source,
      args: args,
      body: body,
      wrapped: wrapSource(body, breakPointAt)
    };
  }

  postMessage(queue);
};
