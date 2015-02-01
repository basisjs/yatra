// This module uses for runner build.

// Export runner to global scrope
global.yatra = require('runner');

// Try resolve base path to runner static files.
runner.setup({
  baseURI: basis.path.dirname(basis.array(document.scripts).pop().src || '')
});
