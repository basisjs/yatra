var document = global.document;
var EnvClass;

if (document)
  EnvClass = resource('env/iframe.js').fetch();
else
  EnvClass = function(){}

module.exports = {
  create: function(init, html){
    return new EnvClass({
      initEnv: init,
      html: html
    });
  }
};
