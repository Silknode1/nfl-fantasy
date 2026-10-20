import { useEffect, useMemo, useState } from 'react'
import type { NewsItem } from '../espn/parse'
import { NewsCard } from './glass'
import {
  DESK_NEWS_EVENT,
  createSubmission,
  inferDeskScope,
  readSubmissions,
  saveSubmission,
  toNewsItem,
  type DeskClub,
  type DeskPlayerRef,
  type DeskScope,
  type DeskSubmission,
} from '../news/submit'

function browserStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function useDeskSubmissions(): DeskSubmission[] {
  const [rows, setRows] = useState<DeskSubmission[]>(() => readSubmissions(browserStore()))
  useEffect(() => {
    const sync = () => setRows(readSubmissions(browserStore()))
    window.addEventListener(DESK_NEWS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DESK_NEWS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return rows
}

export function useDeskNews(): NewsItem[] {
  const rows = useDeskSubmissions()
  return useMemo(() => rows.map(toNewsItem), [rows])
}

export function SubmittedList({ items, empty }: { items: NewsItem[]; empty: string }) {
  if (!items.length) return <p className="muted small">{empty}</p>
  return (
    <div className="news-cols">
      {items.map((item) => (
        <NewsCard
          key={item.id}
          kicker="Your link"
          title={item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a> : item.headline}
        >
          {item.summary ? <p className="news-preview">{item.summary}</p> : <p className="muted small">No pasted text, so there is no preview.</p>}
        </NewsCard>
      ))}
    </div>
  )
}

async function youtubeTitle(url: string): Promise<string | null> {
  if (!/youtu\.?be/i.test(url)) return null
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string') return body.title.trim()
    return null
  } catch {
    return null
  }
}

export function SubmitLink({
  players,
  clubs,
  preset,
}: {
  players: DeskPlayerRef[]
  clubs: DeskClub[]
  preset?: { scope?: DeskScope; team?: string | null; playerId?: string | null }
}) {
  const locked = Boolean(preset?.scope)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [pasted, setPasted] = useState('')
  const [scope, setScope] = useState<DeskScope>(preset?.scope ?? 'league')
  const [team, setTeam] = useState(preset?.team ?? '')
  const [playerId, setPlayerId] = useState(preset?.playerId ?? '')
  const [touched, setTouched] = useState(locked)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (touched) return
    const guess = inferDeskScope(`${title} ${pasted}`, players, clubs)
    setScope(guess.scope)
    if (guess.playerId) setPlayerId(guess.playerId)
    if (guess.team) setTeam(guess.team)
  }, [title, pasted, touched, players, clubs])

  const teamOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const club of clubs) {
      const abbr = club.abbr.toUpperCase()
      if (abbr && !seen.has(abbr)) { seen.add(abbr); out.push(abbr) }
    }
    for (const player of players) {
      const abbr = player.nfl.toUpperCase()
      if (abbr && !seen.has(abbr)) { seen.add(abbr); out.push(abbr) }
    }
    return out.sort()
  }, [clubs, players])

  const submit = async () => {
    setBusy(true)
    setNote(null)
    const fetched = title.trim() ? null : await youtubeTitle(url)
    const made = createSubmission({
      url,
      title: title.trim() || fetched || '',
      pasted,
      scope,
      team: team || null,
      playerId: playerId || null,
      clubs,
      players,
    })
    setBusy(false)
    if (!made.ok) {
      setNote(made.error)
      return
    }
    saveSubmission(browserStore(), made.submission)
    window.dispatchEvent(new Event(DESK_NEWS_EVENT))
    setUrl('')
    setTitle('')
    setPasted('')
    if (!locked) {
      setScope('league')
      setTeam('')
      setPlayerId('')
      setTouched(false)
    }
    setNote(made.submission.summary ? 'Saved. The preview is only the text you pasted.' : 'Saved. No preview until you paste the article text.')
  }

  return (
    <form
      className="submit-link"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="submit-head">
        <h3>Add a link</h3>
        <p className="muted small">Paste a URL. A preview is only built from text you paste. If this link is already in the feed, that story moves up.</p>
      </div>
      <label>
        <span className="sr">Link</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" aria-label="Link" required />
      </label>
      <label>
        <span className="sr">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, if you have one" aria-label="Title" />
      </label>
      <label>
        <span className="sr">Article text</span>
        <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the article text if the link will not open here" aria-label="Article text" rows={3} />
      </label>
      <div className="submit-row">
        <label>
          <span className="sr">Scope</span>
          <select
            value={scope}
            aria-label="Who this link is about"
            onChange={(e) => {
              setTouched(true)
              setScope(e.target.value as DeskScope)
            }}
          >
            <option value="league">League</option>
            <option value="team">Team</option>
            <option value="player">Player</option>
          </select>
        </label>
        {scope === 'team' && (
          <label>
            <span className="sr">Team</span>
            <select value={team} aria-label="Team" onChange={(e) => { setTouched(true); setTeam(e.target.value) }}>
              <option value="">Team</option>
              {teamOptions.map((abbr) => <option key={abbr} value={abbr}>{abbr}</option>)}
            </select>
          </label>
        )}
        {scope === 'player' && (
          <label>
            <span className="sr">Player</span>
            <select value={playerId} aria-label="Player" onChange={(e) => {
              setTouched(true)
              setPlayerId(e.target.value)
              const hit = players.find((p) => p.id === e.target.value)
              if (hit?.nfl) setTeam(hit.nfl.toUpperCase())
            }}>
              <option value="">Player</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving' : 'Add link'}</button>
      </div>
      {note && <p className="submit-note" role="status">{note}</p>}
    </form>
  )
}
