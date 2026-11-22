import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths -> the built game works from any folder or sub-URL
  // (GitHub Pages, itch.io, Netlify, Vercel...).
  base: './',
  build: {
    // Three.js alone is ~500 kB, so the default warning is expected noise.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true, // also reachable from your phone on the same Wi-Fi
  },
});
