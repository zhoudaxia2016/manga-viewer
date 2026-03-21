import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// GitHub Pages 项目页 URL 为 /<repo>/，生产构建资源必须带此前缀，否则白屏
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/manga-viewer/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}));
