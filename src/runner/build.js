// This module uses for runner build.
var runner = require('runner');

// Export runner to global scrope
global.yatra = runner;

// Try resolve base path to runner static files.
runner.setup({
  baseURI: basis.path.dirname(basis.array(document.scripts).pop().src || '')
});
