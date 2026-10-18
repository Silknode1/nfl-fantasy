import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const espn = {
  '/espn': {
    target: 'https://site.api.espn.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/espn/, ''),
    // ESPN rejects a HeadlessChrome user agent. The dev proxy sends a normal browser
    // agent so the scoreboard and the game summary both answer.
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  },
}

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy: espn },
  preview: { port: 5174, strictPort: true, proxy: espn },
})
