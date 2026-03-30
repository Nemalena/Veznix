import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Tiptap packages hoisted to monorepo root — alias them so Rollup resolves consistently
      '@tiptap/extension-history': path.resolve(__dirname, '../../node_modules/@tiptap/extension-history'),
      '@tiptap/extension-text-style': path.resolve(__dirname, '../../node_modules/@tiptap/extension-text-style'),
    },
    dedupe: ['@tiptap/core', '@tiptap/pm'],
  },
  server: {
    port: 5173,
    allowedHosts: ['veznix.nemalena.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
 preview: {
    allowedHosts: ['veznix.nemalena.com']
 }
})
