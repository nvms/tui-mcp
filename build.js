import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/monitor/index.jsx'],
  outfile: 'dist/monitor.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  jsxImportSource: '@trendr/core',
  banner: { js: '#!/usr/bin/env node' },
})
