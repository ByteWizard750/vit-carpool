import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const apiProxy: ProxyOptions = {
  target: 'http://localhost:3000',
  changeOrigin: true,
  bypass(req) {
    if (req.headers.accept?.includes('text/html')) {
      return '/index.html';
    }
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vit-carpool/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/health': apiProxy,
      '/rides': apiProxy,
      '/vehicles': apiProxy,
      '/locations': apiProxy,
      '/bookings': apiProxy,
      '/chat': apiProxy,
      '/ratings': apiProxy,
      '/auth': apiProxy,
      '/users': apiProxy,
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
