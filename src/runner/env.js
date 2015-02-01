var document = global.document;
var Map = require('basis.data').KeyObjectMap;
var EnvClass;

if (document)
  EnvClass = require('./env/iframe.js');

function createEnv(html){
  return new EnvClass({
    html: html
  });
}

var envMap = new Map({
  create: createEnv
});

module.exports = {
  create: createEnv,

  get: function(html, clean){
    if (clean)
      return createEnv(html);

    return envMap.resolve(html);
  }
};
