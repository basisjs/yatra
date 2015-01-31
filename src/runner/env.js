var document = global.document;
var EnvClass;

if (document)
  EnvClass = require('./env/iframe.js');

module.exports = {
  create: function(init, html){
    return new EnvClass({
      initEnv: init,
      html: html
    });
  }
};
