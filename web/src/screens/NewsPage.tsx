import { useEffect, useMemo, useState } from 'react'
import { useOptionalEngine } from '../dataContext'
import { fetchNewsBundle } from '../espn/load'
import { dedupeNews, linkNewsToPlayers, newsFromPlayers, type NewsItem } from '../espn/parse'
import { EmptyState, GlassCard, NewsCard, Skeleton } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'
import { SubmitLink, useDeskNews } from '../components/SubmitLink'
import { DATE_LABEL, filterNews, POPULARITY_LABEL, UNTAGGED_RULE, type NewsFilter, type PopularityPlayer } from '../news/feed'
import { previewText } from '../news/preview'
import { mergeDeskNews, newsForLeague, sourceLabel } from '../news/submit'

const FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'popularity', label: 'Popularity' },
  { id: 'date', label: 'Date' },
  { id: 'player', label: 'Player news' },
  { id: 'team', label: 'Team news' },
]

const NOTE: Record<NewsFilter, string> = {
  popularity: POPULARITY_LABEL,
  date: DATE_LABEL,
  player: 'Player news is tagged to one player. Newest first.',
  team: `${UNTAGGED_RULE} Newest first.`,
}

function when(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Item({ item }: { item: NewsItem }) {
  const stamp = when(item.published)
  const nextPlayer = item.playerId
  const nextTeam = item.teams[0]
  const preview = previewText(item.summary, item.headline)
  const source = sourceLabel(item.source)
  return (
    <NewsCard
      kicker={`${source}${stamp ? ` · ${stamp}` : ''}`}
      title={
        item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a>
        ) : nextPlayer ? (
          <PlayerLink id={nextPlayer} name={item.headline} />
        ) : nextTeam ? (
          <TeamLink abbr={nextTeam}>{item.headline}</TeamLink>
        ) : (
          item.headline
        )
      }
    >
      {preview ? <p className="news-preview">{preview}</p> : null}
      <p className="news-next">
        {nextPlayer && <PlayerLink id={nextPlayer} name="Open player" />}
        {item.teams.map((abbr) => <TeamLink key={abbr} abbr={abbr} />)}
        {item.gameId && <a className="dest" href={`#game/${encodeURIComponent(item.gameId)}`}>Open game</a>}
        {item.url && <a className="dest" href={item.url} target="_blank" rel="noreferrer">Read story</a>}
        {!nextPlayer && !nextTeam && !item.gameId && <a className="dest" href="#games">Open the week</a>}
      </p>
    </NewsCard>
  )
}

export function NewsPage() {
  const engine = useOptionalEngine()
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const [gap, setGap] = useState<string | null>(null)
  const [filter, setFilter] = useState<NewsFilter>('date')
  const desk = useDeskNews()

  useEffect(() => {
    let stop = false
    fetchNewsBundle().then((bundle) => {
      if (stop) return
      const players = engine?.d.players ?? []
      const jev = newsFromPlayers(players)
      const merged = dedupeNews(linkNewsToPlayers([...jev, ...bundle.espn, ...bundle.scoreboard], players))
      setItems(merged)
      if (!merged.length) {
        setGap(bundle.espnFailed && bundle.boardFailed
          ? 'ESPN news and the scoreboard did not answer, and the league file has no headlines.'
          : 'No headlines on this pull.')
      } else if (!jev.length && bundle.espnFailed) {
        setGap('ESPN news did not answer. These lines are from the scoreboard.')
      } else {
        setGap(null)
      }
    })
    return () => { stop = true }
  }, [engine])

  const roster = engine?.d.players
  const players = useMemo<PopularityPlayer[]>(
    () => (roster ?? []).map((p) => ({ id: p.id, own: p.own, adds: p.adds })),
    [roster],
  )
  const cast = useMemo(
    () => (roster ?? []).map((p) => ({ id: p.id, name: p.name, nfl: p.nfl })),
    [roster],
  )
  const clubs = useMemo(() => {
    const seen = new Set<string>()
    const out: { abbr: string; name: string }[] = []
    for (const p of cast) {
      const abbr = p.nfl.toUpperCase()
      if (!abbr || seen.has(abbr)) continue
      seen.add(abbr)
      out.push({ abbr, name: abbr })
    }
    return out
  }, [cast])
  const shown = useMemo(
    () => filterNews(newsForLeague(mergeDeskNews(items ?? [], desk)), filter, players),
    [items, desk, filter, players],
  )

  return (
    <section className="screen">
      <GlassCard featured lean>
        <div className="panel-head">
          <h2>News</h2>
          <div className="seg news-filters" role="group" aria-label="News filters">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={filter === entry.id ? 'on' : ''}
                aria-pressed={filter === entry.id}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <p className="news-rule">{NOTE[filter]}</p>
        {gap && <p>{gap}</p>}
        <SubmitLink players={cast} clubs={clubs} />
      </GlassCard>
      {items === null && shown.length === 0 && <Skeleton variant="rows" label="Loading headlines" />}
      {items !== null && shown.length === 0 && (
        <EmptyState title="No headlines in this filter" body="Nothing in this cut of the pull. Another filter may still have lines." />
      )}
      {shown.length > 0 && (
        <div className="news-cols">
          {shown.map((item) => <Item key={item.id} item={item} />)}
        </div>
      )}
    </section>
  )
}
