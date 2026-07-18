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

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'buffer', 'stream', 'util', 'process', 'zlib'],
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
