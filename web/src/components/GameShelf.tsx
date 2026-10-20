import { useEffect, useState } from 'react'
import { useOptionalEngine } from '../dataContext'
import { fetchNewsBundle } from '../espn/load'
import { dedupeNews, linkNewsToPlayers, newsFromPlayers, type NewsItem } from '../espn/parse'
import type { BoardGame } from '../board/normalize'
import { filterNews, newsTeams, pinGameId, readPinnedGames, unpinGameId, writePinnedGames } from '../board/shelf'
import { PlayerLink } from './links'

export interface ShelfPlayer {
  id: string
  name: string
  proj: number | null
  scored: number | null
}

function store(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function GameShelf({
  game,
  games,
  players,
  gameState,
  onSelect,
}: {
  game: BoardGame | null
  games: BoardGame[]
  players: ShelfPlayer[]
  gameState: BoardGame['state'] | null
  onSelect: (id: string) => void
}) {
  const engine = useOptionalEngine()
  const [collapsed, setCollapsed] = useState(false)
  const [playersOpen, setPlayersOpen] = useState(true)
  const [newsOpen, setNewsOpen] = useState(false)
  const [pins, setPins] = useState<string[]>(() => readPinnedGames(store()))
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [newsGap, setNewsGap] = useState<string | null>(null)
  const [team, setTeam] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    let stop = false
    fetchNewsBundle().then((bundle) => {
      if (stop) return
      const roster = engine?.d.players ?? []
      const merged = dedupeNews(linkNewsToPlayers([...newsFromPlayers(roster), ...bundle.espn, ...bundle.scoreboard], roster))
      setNews(merged)
      if (!merged.length) {
        setNewsGap(bundle.espnFailed && bundle.boardFailed
          ? 'ESPN news and the scoreboard did not answer, and the league file has no headlines.'
          : 'No headlines on this pull.')
      } else {
        setNewsGap(null)
      }
    }).catch(() => {
      if (!stop) setNewsGap('League news has not arrived.')
    })
    return () => { stop = true }
  }, [engine])

  const pin = () => {
    if (!game) return
    const next = pinGameId(pins, game.id)
    setPins(next)
    writePinnedGames(store(), next)
  }
  const remove = (id: string) => {
    const next = unpinGameId(pins, id)
    setPins(next)
    writePinnedGames(store(), next)
  }
  const shown = news ? filterNews(news, { team, text }) : []
  const teams = news ? newsTeams(news) : []

  return (
    <aside className={collapsed ? 'game-shelf is-collapsed' : 'game-shelf'} aria-label="Shelf">
      <button type="button" className="shelf-collapse" aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? 'Shelf' : 'Hide shelf'}
      </button>
      {!collapsed && (
        <>
          {game && <button type="button" className="pin-game" onClick={pin}>Pin Game</button>}
          {pins.length > 0 && (
            <ul className="shelf-pins">
              {pins.map((id) => {
                const hit = games.find((row) => row.id === id)
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onSelect(id)}>{hit ? `${hit.away.abbr} at ${hit.home.abbr}` : 'Not on this week\'s board'}</button>
                    <button type="button" className="ghost" onClick={() => remove(id)}>Remove</button>
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" className="shelf-tab" aria-expanded={playersOpen} onClick={() => setPlayersOpen((v) => !v)}>
            My players
          </button>
          {playersOpen && (
            players.length === 0 ? <p className="muted">Nobody from your roster is in this game.</p> : (
              <ul className="shelf-list">
                {players.map((row) => (
                  <li key={row.id}>
                    <PlayerLink id={row.id} name={row.name} />
                    {gameState === 'pre' || row.scored == null ? (
                      <span>{row.proj == null ? 'No week projection stored' : `${row.proj} projected this week`}</span>
                    ) : (
                      <span>{row.scored} so far · {row.proj == null ? 'no week projection stored' : `${row.proj} projected this week`}. Points so far and the projection are different numbers.</span>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
          <button type="button" className="shelf-tab" aria-expanded={newsOpen} onClick={() => setNewsOpen((v) => !v)}>
            League news
          </button>
          {newsOpen && (
            <div className="shelf-news">
              <label>
                <span className="sr">Filter headlines by club</span>
                <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter headlines by club">
                  <option value="">All clubs</option>
                  {teams.map((abbr) => <option key={abbr} value={abbr}>{abbr}</option>)}
                </select>
              </label>
              <label>
                <span className="sr">Filter headlines</span>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter headlines" aria-label="Filter headlines" />
              </label>
              {newsGap && <p>{newsGap}</p>}
              {news === null && !newsGap && <p className="muted">League news has not arrived.</p>}
              {news !== null && shown.length === 0 && !newsGap && <p className="muted">No headline matches.</p>}
              <ul className="shelf-list">
                {shown.map((item) => (
                  <li key={item.id}>
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a> : item.headline}
                    {item.teams.length > 0 && <small>{item.teams.join(' ')}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
