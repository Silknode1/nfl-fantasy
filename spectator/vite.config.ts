import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const browser = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function espnProxy(prefix: string, target: string) {
  return {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ''),
    // ESPN rejects a HeadlessChrome user agent. The dev proxy sends a normal browser
    // agent so the scoreboard, summaries, and team feeds all answer.
    headers: { 'User-Agent': browser },
  }
}

const espn = {
  '/espn': espnProxy('/espn', 'https://site.api.espn.com'),
  '/core': espnProxy('/core', 'https://sports.core.api.espn.com'),
}

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy: espn },
  preview: { port: 5174, strictPort: true, proxy: espn },
})
