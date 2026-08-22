import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import commonjs from 'vite-plugin-commonjs';

// Custom plugin to handle cornerstone codec imports
function cornerstoneCodecPlugin() {
  return {
    name: 'cornerstone-codec-fix',
    transform(code: string, id: string) {
      // Strip Vite's `?v=` version query — the transform id for a re-requested
      // module ends with `_decode.js?v=<hash>`, which broke the endsWith match
      // and left the UMD codec without a default export (fresh-worktree dev
      // servers crashed on module load). See wayfinder #132 verification.
      const cleanId = id.split('?')[0];
      if (!cleanId.includes('@cornerstonejs/codec-') || !cleanId.endsWith('.js')) return null;
      if (code.includes('export default')) return null;
      // Emscripten UMD codecs declare `var <name> = (() => { ... })()`, then
      // set module.exports — Vite needs a default export instead. This covers
      // the *_decode.js codecs (jpeg/charls/openjpeg) AND the openjph codec
      // (`openjphjs.js`), which dicom-image-loader default-imports.
      const varMatch = code.match(/var\s+(\w+)\s*=\s*\(\(\)\s*=>/);
      if (varMatch) {
        return `${code}\nexport default ${varMatch[1]};`;
      }
      return null;
    },
  };
}

/**
 * Custom plugin to shim zlib for dicom-parser.
 *
 * dicom-parser's UMD bundle calls require('zlib') in CJS mode, which fails
 * in browsers. This plugin replaces those calls with a pako-based shim and
 * injects a pako import so the global `pako` variable is available for
 * dicom-parser's built-in browser deflated transfer syntax support.
 */
function zlibShimPlugin() {
  return {
    name: 'zlib-shim',
    transform(code: string, id: string) {
      if (id.includes('dicom-parser') && id.includes('dicomParser')) {
        // Replace require('zlib') with a pako-based shim
        const shimCode = `
import * as __pako from 'pako';
if (typeof window !== 'undefined') { window.pako = __pako; }
var __zlib_shim = { inflateRawSync: __pako.inflateRaw, inflateSync: __pako.inflate };
`;
        return (
          shimCode +
          code.replace(/require\(['"]zlib['"]\)/g, '__zlib_shim')
        );
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    zlibShimPlugin(),
    nodePolyfills({
      include: ['events', 'buffer', 'stream', 'util', 'process'],
    }),
    commonjs({
      // Skip ESM-only cornerstone modules that conflict with the commonjs resolver:
      //  - dicom-image-loader uses `new Worker(new URL(...), { type: 'module' })` which breaks
      //    worker code-splitting (IIFE output format error)
      //  - codec *_decode.js files already get a default export appended by cornerstoneCodecPlugin
      filter: (id) => {
        if (id.includes('@cornerstonejs/dicom-image-loader')) return false;
        if (id.includes('@cornerstonejs/codec-') && id.endsWith('_decode.js')) return false;
        return undefined;
      },
    }),
    cornerstoneCodecPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Cornerstone's module worker (`new Worker(new URL(...), { type: 'module' })`) escapes
  // Vite's static worker-type detection; force ES worker bundles (iife + code-splitting is invalid).
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['dicom-parser'],
    exclude: [
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/codec-libjpeg-turbo-8bit',
      '@cornerstonejs/codec-charls',
      '@cornerstonejs/codec-openjpeg',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      // 可用 VITE_PROXY_TARGET 覆盖 (并行开发/隔离 worktree 验证用), 默认主后端
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/dicomweb': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
