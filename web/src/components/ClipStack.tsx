import { useEffect, useRef, useState, type FormEvent } from 'react'
import { advanceClip, youtubeId, youtubeThumb } from '../board/desk'
import {
  clipListFrom,
  clipSearchPath,
  nflWeekStart,
  rankClips,
  readSignals,
  signalFrom,
  teamClipQuery,
  writeSignal,
  youtubeResultsHref,
  type ClipListState,
  type ClipSignal,
  type RankedClip,
} from '../board/clips'
import { fetchScoreboard } from '../board/load'
import { useClips } from '../clip'
import { useOptionalEngine } from '../dataContext'

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

  if (failed) return <p>Clips: the player did not load. The thumbnail is still here.</p>
  return <div className="yt-frame"><div ref={host} /></div>
}

function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function listNote(list: ClipListState | null, asked: boolean): string | null {
  if (!asked) return 'The week start is not on this board, so the top-3 list is not requested.'
  if (!list) return null
  if (list.status === 'no-key') return 'The top-3 list needs a YouTube key.'
  if (list.status === 'unavailable') return 'The top-3 list has not arrived.'
  if (list.status === 'error') return list.message
  if (list.items.length === 0) return 'No videos published this week for this search.'
  return null
}

export function ClipStack({ contextId, query, kickoffs }: { contextId: string; query: string | null; kickoffs: string[] }) {
  const clipsApi = useClips()
  const [clips, setClips] = useState<SavedClip[]>(() => readClips()[contextId] ?? [])
  const [draft, setDraft] = useState('')
  const [pasteNote, setPasteNote] = useState<string | null>(null)
  const [list, setList] = useState<ClipListState | null>(null)
  const [asked, setAsked] = useState(false)
  const [signals, setSignals] = useState<ClipSignal[]>(() => readSignals(localStorage, contextId))
  const [active, setActive] = useState<string | null>(null)
  const memory = clipsApi.play.memory[contextId] ?? { index: 0, seconds: 0 }
  const [index, setIndex] = useState(memory.index)
  const [loop, setLoop] = useState(0)
  const seconds = useRef(memory.seconds)
  const indexRef = useRef(index)
  indexRef.current = index
  const playing = clipsApi.play.centerPlaying && clipsApi.play.audible === 'center' && clipsApi.play.centerGameId === contextId
  const publishedAfter = nflWeekStart(kickoffs)
  const ranked: RankedClip[] = list?.status === 'ok' ? rankClips(list.items, signals) : []

  useEffect(() => {
    const saved = readClips()[contextId] ?? []
    setClips(saved)
    setLoop(0)
    setActive(null)
    setSignals(readSignals(localStorage, contextId))
    const remembered = clipsApi.play.memory[contextId] ?? { index: 0, seconds: 0 }
    setIndex(saved.length ? Math.min(remembered.index, saved.length - 1) : 0)
    seconds.current = remembered.seconds
    clipsApi.setSpot({ gameId: contextId, index: remembered.index, seconds: remembered.seconds })
    return () => {
      clipsApi.exitCenter(contextId, indexRef.current, seconds.current)
    }
    // The stack resets only when the clip context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId])

  useEffect(() => {
    clipsApi.setSpot({ gameId: contextId, index, seconds: seconds.current })
  }, [clipsApi, contextId, index])

  useEffect(() => {
    if (!query || !publishedAfter) {
      setAsked(false)
      setList(null)
      return
    }
    let stop = false
    setAsked(true)
    fetch(clipSearchPath(query, publishedAfter))
      .then((res) => res.json())
      .then((raw: unknown) => { if (!stop) setList(clipListFrom(raw)) })
      .catch(() => { if (!stop) setList({ status: 'unavailable' }) })
    return () => { stop = true }
  }, [query, publishedAfter])

  const persist = (next: SavedClip[]) => {
    setClips(next)
    const all = readClips()
    all[contextId] = next
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
    const typed = draft.trim()
    if (!clips.some((clip) => clip.videoId === id)) persist([...clips, { videoId: id, title: typed }])
    setDraft('')
    const watch = `https://www.youtube.com/watch?v=${id}`
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!body || typeof body !== 'object') return
        const rec = body as Record<string, unknown>
        const title = typeof rec.title === 'string' ? rec.title.trim() : ''
        const channel = typeof rec.author_name === 'string' ? rec.author_name.trim() : ''
        if (title) {
          setClips((cur) => {
            const next = cur.map((clip) => (clip.videoId === id ? { ...clip, title } : clip))
            const all = readClips()
            all[contextId] = next
            writeClips(all)
            return next
          })
        }
        setSignals(writeSignal(localStorage, contextId, signalFrom({ channelTitle: channel || null, title: title || typed })))
      })
      .catch(() => { /* a paste with no oEmbed title stays the text the user typed */ })
  }

  const toggle = () => {
    if (!clips.length) return
    if (playing) {
      const at = clipsApi.timeRead.current?.() ?? seconds.current
      seconds.current = at
      clipsApi.stopCenter(contextId, index, at)
      return
    }
    setActive(null)
    clipsApi.startCenter(contextId)
  }

  const playListed = (id: string) => {
    if (active === id) {
      setActive(null)
      return
    }
    if (clipsApi.play.centerPlaying) {
      const at = clipsApi.timeRead.current?.() ?? seconds.current
      seconds.current = at
      clipsApi.stopCenter(contextId, index, at)
    }
    setActive(id)
  }

  const note = listNote(list, asked)

  return (
    <section className="clip-stack desk-section" aria-label="Clips">
      <h3>Clips</h3>
      {query ? (
        <p className="news-next">
          <a className="dest" href={youtubeResultsHref(query)} target="_blank" rel="noreferrer">YouTube search: {query}</a>
        </p>
      ) : (
        <p>The week number has not arrived, so this page has no YouTube search link.</p>
      )}
      <form className="clip-paste" onSubmit={add}>
        <label>
          <span className="sr">Paste a YouTube link</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a YouTube link" aria-label="Paste a YouTube link" />
        </label>
        <button type="submit" className="ghost">Add</button>
      </form>
      {pasteNote && <p className="block-fail">{pasteNote}</p>}
      {note && <p className={list?.status === 'error' || list?.status === 'unavailable' ? 'block-fail' : undefined}>{note}</p>}
      {ranked.length > 0 && (
        <ol className="clip-row">
          {ranked.map((clip) => {
            const on = active === clip.videoId
            return (
              <li key={clip.videoId} className={on ? 'on' : ''}>
                {on ? (
                  <ActiveClip videoId={clip.videoId} start={0} onTime={() => {}} onEnded={() => setActive(null)} />
                ) : (
                  <img src={youtubeThumb(clip.videoId)} alt="" width={320} height={180} />
                )}
                <span>{clip.title}</span>
                {clip.channelTitle && <small>{clip.channelTitle}</small>}
                {clip.because && <small>{clip.because}</small>}
                <button type="button" className="ghost" onClick={() => playListed(clip.videoId)}>{on ? 'Pause' : 'Play'}</button>
              </li>
            )
          })}
        </ol>
      )}
      {clips.length === 0 ? (
        <p className="muted">No clip pasted here. Nothing plays until you add one and press play.</p>
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
                  <span>{clip.title}</span>
                  {!showPlayer && on && seconds.current > 1 && <small>Paused at {stamp(seconds.current)}</small>}
                  <span className="clip-actions">
                    <button type="button" className="ghost" onClick={() => { seconds.current = on ? seconds.current : 0; setActive(null); setIndex(i) }}>This clip</button>
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

export function TeamClipSearch({ team }: { team: string }) {
  const engine = useOptionalEngine()
  const [week, setWeek] = useState<number | null>(engine?.d.meta.week ?? null)
  const [kickoffs, setKickoffs] = useState<string[]>([])
  useEffect(() => {
    let stop = false
    fetchScoreboard()
      .then(({ board }) => {
        if (stop) return
        setKickoffs(board.games.map((game) => game.kickoff))
        setWeek(board.week || engine?.d.meta.week || null)
      })
      .catch(() => { /* the search link waits until a week number exists */ })
    return () => { stop = true }
  }, [engine])
  return (
    <ClipStack
      contextId={`team:${team}`}
      query={week ? teamClipQuery(team, week) : null}
      kickoffs={kickoffs}
    />
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
