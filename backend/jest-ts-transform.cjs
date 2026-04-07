const { transformSync } = require('esbuild');

module.exports = {
  process(content, filename) {
    const result = transformSync(content, {
      loader: 'ts',
      format: 'esm',
      sourcefile: filename,
      sourcemap: 'inline',
    });
    return { code: result.code };
  },
};
