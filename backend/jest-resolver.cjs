const path = require('path');
const fs = require('fs');

/**
 * Custom Jest resolver that maps .js imports to .ts files when
 * the .ts file exists (for the JS-to-TS migration period).
 */
module.exports = (request, options) => {
  // Use default resolver first
  try {
    return options.defaultResolver(request, options);
  } catch (error) {
    // If the .js file is not found, try .ts
    if (request.endsWith('.js')) {
      const tsRequest = request.replace(/\.js$/, '.ts');
      try {
        return options.defaultResolver(tsRequest, options);
      } catch {
        // fall through to throw original error
      }
    }
    throw error;
  }
};
