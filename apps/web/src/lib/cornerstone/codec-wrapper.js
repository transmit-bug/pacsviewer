// Wrapper for cornerstone codec modules
// This file provides ES module exports for CommonJS codec modules

// Import the original codec
const libjpegTurbo = require('@cornerstonejs/codec-libjpeg-turbo-8bit');

// Re-export as default
module.exports = libjpegTurbo;
module.exports.default = libjpegTurbo;
