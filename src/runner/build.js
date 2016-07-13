// this module uses for runner build
var runner = require('runner');

// export runner to global scope
global.yatra = runner;

// try resolve base path to runner static files
runner.setup({
  baseURI: basis.path.dirname(basis.array(document.scripts).pop().src || '')
});
