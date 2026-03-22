import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// GitHub Pages 项目页 URL 为 /<repo>/，生产构建资源必须带此前缀，否则白屏
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/manga-viewer/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Manga Viewer',
        short_name: 'MangaViewer',
        description: '漫画阅读器',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        start_url: '/manga-viewer/',
        scope: '/manga-viewer/',
        icons: [
          {
            src: '/manga-viewer/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/manga-viewer/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/manga-viewer/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // API 请求：NetworkFirst，有网走线上，无网走缓存
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // 图片：NetworkFirst，支持断网浏览已缓存内容
            urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//],
      },
    }),
  ],
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
