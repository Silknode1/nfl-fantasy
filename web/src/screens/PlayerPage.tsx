import { useEffect, useState } from 'react'
import { useOptionalEngine } from '../dataContext'
import { fetchAthlete } from '../espn/load'
import type { AthleteCard, NewsItem } from '../espn/parse'
import { PlayerProfile } from '../components/PlayerProfile'
import { BackButton, TeamLink } from '../components/links'

function EspnPlayer({ id }: { id: string }) {
  const [card, setCard] = useState<AthleteCard | null | 'missing'>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    setCard(null)
    setNews([])
    setError(null)
    fetchAthlete(id)
      .then((next) => {
        if (stop) return
        setCard(next.card)
        setNews(next.news.slice(0, 4))
      })
      .catch((e: Error) => {
        if (stop) return
        setCard('missing')
        setError(e.message === '404' ? 'ESPN has no player with that id.' : `ESPN did not answer (${e.message}).`)
      })
    return () => { stop = true }
  }, [id])

  if (card === null) return <p className="loading">Loading the player</p>
  if (card === 'missing') {
    return (
      <>
        <BackButton fallback="#news" />
        <h2>No player with that id</h2>
        <p>{error}</p>
        <p className="news-next"><a className="dest" href="#news">News</a><a className="dest" href="#games">Games</a></p>
      </>
    )
  }

  const headline = news[0]
  return (
    <>
      <header className="profile-head">
        {card.headshot && <img className="club-logo" src={card.headshot} alt="" width={72} height={72} />}
        <div className="profile-id">
          <h2>{card.name}</h2>
          <p className="pmeta">
            {card.pos && <span>{card.pos}</span>}
            {card.teamAbbr && <TeamLink abbr={card.teamAbbr}>{card.teamName ?? card.teamAbbr}</TeamLink>}
            {card.jersey && <span>#{card.jersey}</span>}
            <span>{card.injury ?? (card.status === 'Active' ? 'No injury tag on this pull' : card.status ?? 'Status not listed')}</span>
          </p>
        </div>
        <BackButton fallback={card.teamAbbr ? `#team/${card.teamAbbr}` : '#news'} />
      </header>
      <p>League projections and trade surplus are not in the loaded file for this id. The lines below are what ESPN returned.</p>
      {card.stats.length > 0 ? (
        <div className="ptiles">
          {card.stats.slice(0, 4).map((s) => (
            <div key={s.label} className="ptile">
              <span className="ptile-l">{s.label}</span>
              <b>{s.value}</b>
            </div>
          ))}
        </div>
      ) : (
        <p>No season stat line on this pull.</p>
      )}
      <h3>News</h3>
      {headline ? (
        <p>
          {headline.url ? <a href={headline.url} target="_blank" rel="noreferrer">{headline.headline}</a> : headline.headline}
        </p>
      ) : (
        <p>No headline on this pull.</p>
      )}
      <p className="news-next">
        {card.teamAbbr && <TeamLink abbr={card.teamAbbr}>Club page</TeamLink>}
        <a className="dest" href="#news">News desk</a>
        {headline?.url && <a className="dest" href={headline.url} target="_blank" rel="noreferrer">Read story</a>}
      </p>
    </>
  )
}

export function PlayerPage({ id }: { id: string }) {
  const engine = useOptionalEngine()
  const fantasy = engine?.d.players.find((p) => p.id === id) ?? null
  return (
    <section className="screen">
      <article className="panel destination">
        {fantasy && engine ? (
          <PlayerProfile p={fantasy} week={engine.d.meta.week} page />
        ) : (
          <EspnPlayer id={id} />
        )}
      </article>
    </section>
  )
}
