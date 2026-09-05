import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Run from the project root: `npm run build:app`
// (= vite build --config src/Admin/vite.config.ts). The npm scripts and
// dependencies live in the root package.json; this folder is just source.
export default defineConfig({
  root: import.meta.dirname,
  // The bundle is enqueued from
  // /wp-content/plugins/{{slug}}/src/Admin/dist/, not the domain root,
  // so hashed asset URLs in index.css must resolve relative to it.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  build: {
    // Compiled bundle lands next to this file in src/Admin/dist/ — the
    // only part of src/Admin/ that ships. AdminMenu.php enqueues it.
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'main.tsx',
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (asset) => {
          const name = asset.names?.[0] ?? '';
          return name.endsWith('.css') ? 'index.css' : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
