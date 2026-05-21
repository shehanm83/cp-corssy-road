import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative asset URLs so the same build works at /, /cp-corssy-road/,
  // file://, or any other base path the host happens to use.
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
