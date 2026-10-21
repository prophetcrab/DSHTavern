/**
 * Build the browser half as the client module system's closure-factory CJS
 * artifact: the shell-evaluated bundle calls `window.__ModuleLoader__.load`
 * and resolves the shared baseline (React) through the injected `require`.
 */
export default {
  name: 'dshtavern/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  sourcemap: false,
  deps: {
    neverBundle: (specifier: string) => specifier === 'react' || specifier.startsWith('react/'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    banner: 'window.__ModuleLoader__.load({ id: "dshtavern", factory: (require) => {',
    footer: 'return module.exports; } });',
  },
}
