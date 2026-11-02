import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) } } },
});
