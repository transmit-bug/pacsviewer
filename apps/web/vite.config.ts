import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import commonjs from 'vite-plugin-commonjs';

// Custom plugin to handle cornerstone codec imports
function cornerstoneCodecPlugin() {
  return {
    name: 'cornerstone-codec-fix',
    transform(code: string, id: string) {
      // Fix imports for cornerstone codec modules
      if (id.includes('@cornerstonejs/codec-') && id.endsWith('_decode.js')) {
        // Add default export if missing
        if (!code.includes('export default')) {
          // Extract the variable name from the code
          const varMatch = code.match(/var\s+(\w+)\s*=/);
          if (varMatch) {
            return code + '\nexport default ' + varMatch[1] + ';';
          }
        }
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
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/dicomweb': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
