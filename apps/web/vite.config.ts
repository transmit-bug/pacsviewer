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

// Custom plugin to shim zlib for dicom-parser
function zlibShimPlugin() {
  return {
    name: 'zlib-shim',
    transform(code: string, id: string) {
      // Replace require('zlib') in dicom-parser with pako shim
      if (id.includes('dicom-parser') && id.includes('dicomParser')) {
        // Inject pako as a global and create a zlib-compatible shim
        const shimCode = `
          var __zlib_shim = (function() {
            if (typeof window !== 'undefined' && window.__pako) {
              return {
                inflateRawSync: window.__pako.inflateRaw,
                inflateSync: window.__pako.inflate
              };
            }
            return undefined;
          })();
        `;
        // Inject the shim before the module code
        return shimCode + code.replace(/require\(['"]zlib['"]\)/g, '__zlib_shim');
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
    commonjs(),
    cornerstoneCodecPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
