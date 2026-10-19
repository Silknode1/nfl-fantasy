import { useEffect, useRef, useState, type FormEvent } from 'react'
import { advanceClip, youtubeId, youtubeSearchHref, youtubeThumb } from '../board/desk'
import { useClips } from '../clip'
import { useOptionalFocus } from '../focus'

interface YtPlayer {
  playVideo: () => void
  pauseVideo: () => void
  getCurrentTime: () => number
  destroy: () => void
}

interface YtNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YtPlayer
  PlayerState: { ENDED: number }
}

declare global {
  interface Window {
    YT?: YtNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const CLIP_KEY = 'desk-clips'

interface SavedClip {
  videoId: string
  title: string
}

function readClips(): Record<string, SavedClip[]> {
  try {
    const raw = localStorage.getItem(CLIP_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, SavedClip[]> : {}
  } catch {
    return {}
  }
}

function writeClips(all: Record<string, SavedClip[]>) {
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(all))
  } catch {
    /* private mode: the paste lasts for this view only */
  }
}

let loading: Promise<YtNamespace> | null = null

function loadYouTube(): Promise<YtNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        if (window.YT?.Player) resolve(window.YT)
        else reject(new Error('YouTube'))
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.onerror = () => reject(new Error('YouTube'))
      document.head.appendChild(script)
    })
  }
  return loading
}

export function ActiveClip({ videoId, start, onEnded, onTime }: { videoId: string; start: number; onEnded: () => void; onTime: (seconds: number) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YtPlayer | null>(null)
  const clips = useClips()
  const ended = useRef(onEnded)
  const timed = useRef(onTime)
  ended.current = onEnded
  timed.current = onTime
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    let poll = 0
    loadYouTube()
      .then((YT) => {
        if (dead || !host.current) return
        player.current = new YT.Player(host.current, {
          videoId,
          playerVars: {
            autoplay: 1,
            start: Math.max(0, Math.floor(start)),
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onStateChange: (event: { data: number }) => {
              if (event.data === YT.PlayerState.ENDED) ended.current()
            },
          },
        })
        clips.timeRead.current = () => {
          const t = player.current?.getCurrentTime?.()
          return typeof t === 'number' && Number.isFinite(t) ? t : start
        }
        poll = window.setInterval(() => {
          const t = clips.timeRead.current?.()
          if (typeof t === 'number') timed.current(t)
        }, 400)
      })
      .catch(() => { if (!dead) setFailed(true) })
    return () => {
      dead = true
      window.clearInterval(poll)
      const t = player.current?.getCurrentTime?.()
      if (typeof t === 'number' && Number.isFinite(t)) timed.current(t)
      if (clips.timeRead.current) clips.timeRead.current = null
      player.current?.destroy?.()
      player.current = null
    }
    // start is the resume point at mount. A later tick must not reload the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  if (failed) return <p>Clips: the player did not load. The link is still pinned as a still.</p>
  return <div className="yt-frame"><div ref={host} /></div>
}

function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ClipStack({ gameId, away, home }: { gameId: string; away: string; home: string }) {
  const clipsApi = useClips()
  const focus = useOptionalFocus()
  const [clips, setClips] = useState<SavedClip[]>(() => readClips()[gameId] ?? [])
  const [draft, setDraft] = useState('')
  const [pasteNote, setPasteNote] = useState<string | null>(null)
  const memory = clipsApi.play.memory[gameId] ?? { index: 0, seconds: 0 }
  const [index, setIndex] = useState(memory.index)
  const [loop, setLoop] = useState(0)
  const seconds = useRef(memory.seconds)
  const indexRef = useRef(index)
  indexRef.current = index
  const playing = clipsApi.play.centerPlaying && clipsApi.play.audible === 'center' && clipsApi.play.centerGameId === gameId
  const search = youtubeSearchHref(away, home)

  useEffect(() => {
    const saved = readClips()[gameId] ?? []
    setClips(saved)
    setLoop(0)
    const remembered = clipsApi.play.memory[gameId] ?? { index: 0, seconds: 0 }
    setIndex(saved.length ? Math.min(remembered.index, saved.length - 1) : 0)
    seconds.current = remembered.seconds
    clipsApi.setSpot({ gameId, index: remembered.index, seconds: remembered.seconds })
    return () => {
      clipsApi.exitCenter(gameId, indexRef.current, seconds.current)
    }
    // The stack resets only when the center game changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  useEffect(() => {
    clipsApi.setSpot({ gameId, index, seconds: seconds.current })
  }, [clipsApi, gameId, index])

  const persist = (next: SavedClip[]) => {
    setClips(next)
    const all = readClips()
    all[gameId] = next
    writeClips(all)
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    const id = youtubeId(draft)
    if (!id) {
      setPasteNote('Clips: that link is not a YouTube video.')
      return
    }
    setPasteNote(null)
    if (!clips.some((clip) => clip.videoId === id)) persist([...clips, { videoId: id, title: draft.trim() }])
    setDraft('')
  }

  const toggle = () => {
    if (!clips.length) return
    if (playing) {
      const at = clipsApi.timeRead.current?.() ?? seconds.current
      seconds.current = at
      clipsApi.stopCenter(gameId, index, at)
      return
    }
    clipsApi.startCenter(gameId)
  }

  const pin = (clip: SavedClip) => {
    const at = clipsApi.timeRead.current?.() ?? seconds.current
    seconds.current = at
    clipsApi.pauseForPin(gameId, index, at)
    focus?.pin({ kind: 'video', id: `video:${clip.videoId}`, videoId: clip.videoId, title: clip.title })
  }

  return (
    <section className="clip-stack" aria-label="Clips">
      <h3>Clips</h3>
      <p className="block-fail">Clips: search is unavailable. Paste a link, or open the YouTube search.</p>
      <p className="news-next">
        <a className="dest" href={search} target="_blank" rel="noreferrer">Search {away} and {home} on YouTube</a>
      </p>
      <form className="clip-paste" onSubmit={add}>
        <label>
          <span className="sr">Paste a YouTube link</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a YouTube link" aria-label="Paste a YouTube link" />
        </label>
        <button type="submit" className="ghost">Add</button>
      </form>
      {pasteNote && <p className="block-fail">{pasteNote}</p>}
      {clips.length === 0 ? (
        <p className="muted">No clip pasted for this game. Nothing plays until you add one and press play.</p>
      ) : (
        <>
          <button type="button" className="primary" onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
          <ol className="clip-row">
            {clips.map((clip, i) => {
              const on = i === index
              const showPlayer = playing && on
              return (
                <li key={clip.videoId} className={on ? 'on' : ''}>
                  {showPlayer ? (
                    <ActiveClip
                      key={`${clip.videoId}-${loop}`}
                      videoId={clip.videoId}
                      start={seconds.current}
                      onTime={(t) => { seconds.current = t }}
                      onEnded={() => {
                        seconds.current = 0
                        const next = advanceClip(i, clips.length)
                        if (next === i) setLoop((n) => n + 1)
                        else setIndex(next)
                      }}
                    />
                  ) : (
                    <img src={youtubeThumb(clip.videoId)} alt="" width={320} height={180} />
                  )}
                  {!showPlayer && on && seconds.current > 1 && <small>Paused at {stamp(seconds.current)}</small>}
                  <span className="clip-actions">
                    <button type="button" className="ghost" onClick={() => { seconds.current = on ? seconds.current : 0; setIndex(i) }}>This clip</button>
                    {focus && <button type="button" className="ghost" onClick={() => pin(clip)}>Pin</button>}
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

export function ShelfClip({ videoId, title }: { videoId: string; title: string }) {
  const clipsApi = useClips()
  const playing = clipsApi.play.shelfPlaying && clipsApi.play.audible === 'shelf' && clipsApi.play.shelfVideoId === videoId
  return (
    <div className="shelf-clip">
      {playing ? (
        <ActiveClip videoId={videoId} start={0} onTime={() => {}} onEnded={() => clipsApi.stopShelf()} />
      ) : (
        <img src={youtubeThumb(videoId)} alt="" width={320} height={180} />
      )}
      <p>{title}</p>
      <button type="button" className="ghost" onClick={() => (playing ? clipsApi.stopShelf() : clipsApi.startShelf(videoId))}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  )
}
