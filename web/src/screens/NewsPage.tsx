import { useEffect, useState } from 'react'
import { useOptionalEngine } from '../dataContext'
import { fetchNewsBundle } from '../espn/load'
import { dedupeNews, linkNewsToPlayers, newsFromPlayers, type NewsItem } from '../espn/parse'
import { EmptyState, GlassCard, NewsCard, Skeleton } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'

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
  return (
    <NewsCard
      kicker={`${item.source === 'jev' ? 'League news' : item.source === 'scoreboard' ? 'Scoreboard' : 'ESPN'}${stamp ? ` · ${stamp}` : ''}`}
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
      summary={item.summary}
    >
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

  return (
    <section className="screen">
      <GlassCard featured lean>
        <h2>News</h2>
        <p className="muted">
          Headlines saved on your players, then ESPN and the scoreboard when the league file is quiet. Each card opens a player, a club, or the story.
        </p>
        {gap && <p>{gap}</p>}
      </GlassCard>
      {items === null && <Skeleton variant="rows" label="Loading headlines" />}
      {items && items.length === 0 && (
        <EmptyState title="No headlines yet" body="Nothing landed on this pull. The board is still open if you want the week instead.">
          <p className="news-next"><a className="dest" href="#games">Open the week</a></p>
        </EmptyState>
      )}
      {items?.map((item) => <Item key={item.id} item={item} />)}
    </section>
  )
}
