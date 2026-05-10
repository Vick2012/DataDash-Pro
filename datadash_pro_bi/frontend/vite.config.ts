import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /** Alineado con tauri.conf.json → build.devUrl (evita choque si 5174 queda colgado). */
    port: 5175,
    strictPort: true,
    /** Mismo host que devUrl: evita fallos de resolución localhost/WebView en Windows. */
    host: '127.0.0.1',
  },
});
