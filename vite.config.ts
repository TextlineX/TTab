import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 关键：确保所有资源使用相对路径，解决插件弹窗加载失败问题
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
        // 后台 service worker：manifest 里需要固定文件名
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: chunk => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
