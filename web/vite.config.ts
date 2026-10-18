import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:artifact` inlines everything (data and player photos included) into one HTML file.
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

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  define: { __INLINE_DATA__: JSON.stringify(mode === 'artifact') },
  server: { proxy: espn },
  preview: { proxy: espn },
  build: { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', chunkSizeWarningLimit: 4000 },
}))
