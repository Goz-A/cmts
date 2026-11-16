import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative asset paths so the build works under any GitHub Pages sub-path
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
})
