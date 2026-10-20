import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

type Reply = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** YouTube Data API search, server-side only. The key never goes into the client bundle. */
function youtubeSearchProxy(key: string): Plugin {
  const serve = async (url: string, res: Reply) => {
    res.setHeader('Content-Type', 'application/json')
    if (!key) {
      res.end(JSON.stringify({ configured: false }))
      return
    }
    try {
      const incoming = new URL(url, 'http://127.0.0.1')
      const api = new URL('https://www.googleapis.com/youtube/v3/search')
      api.searchParams.set('part', 'snippet')
      api.searchParams.set('type', 'video')
      api.searchParams.set('order', 'relevance')
      api.searchParams.set('q', incoming.searchParams.get('q') ?? '')
      const max = Math.min(3, Math.max(1, Number(incoming.searchParams.get('maxResults')) || 3))
      api.searchParams.set('maxResults', String(max))
      const after = incoming.searchParams.get('publishedAfter')
      if (after) api.searchParams.set('publishedAfter', after)
      api.searchParams.set('key', key)
      const upstream = await fetch(api)
      const body: unknown = await upstream.json()
      if (!upstream.ok) {
        const message = isRec(body) && isRec(body.error) && typeof body.error.message === 'string' ? body.error.message : `YouTube ${upstream.status}`
        res.end(JSON.stringify({ configured: true, error: message.split(key).join('…') }))
        return
      }
      res.end(JSON.stringify({ configured: true, items: isRec(body) && Array.isArray(body.items) ? body.items : [] }))
    } catch {
      res.end(JSON.stringify({ configured: true, error: 'YouTube search did not answer' }))
    }
  }
  const attach = (middlewares: { use: (fn: (req: { url?: string }, res: Reply, next: () => void) => void) => void }) => {
    middlewares.use((req, res, next) => {
      const url = req.url ?? ''
      if (!url.startsWith('/yt/search')) {
        next()
        return
      }
      void serve(url, res)
    })
  }
  return {
    name: 'youtube-search-proxy',
    configureServer(server) { attach(server.middlewares) },
    configurePreviewServer(server) { attach(server.middlewares) },
  }
}

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const youtubeKey = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || ''
  return {
  base: './',
  plugins: [react(), youtubeSearchProxy(youtubeKey), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  define: { __INLINE_DATA__: JSON.stringify(mode === 'artifact') },
  server: { proxy: espn },
  preview: { proxy: espn },
  build: { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', chunkSizeWarningLimit: 4000 },
  }
})
