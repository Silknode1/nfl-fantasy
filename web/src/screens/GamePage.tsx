import { useEffect, useState } from 'react'
import { fetchGameContext, fetchScoreboard } from '../board/load'
import type { BoardGame, GameContext } from '../board/normalize'
import { BackButton, TeamLink } from '../components/links'
import { GameDetail } from './Board'

export function GamePage({ id }: { id: string }) {
  const [game, setGame] = useState<BoardGame | null | 'missing'>(null)
  const [ctx, setCtx] = useState<GameContext | 'loading' | 'error' | undefined>('loading')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    setGame(null)
    setCtx('loading')
    fetchScoreboard()
      .then(({ board }) => {
        if (stop) return
        const hit = board.games.find((g) => g.id === id) ?? null
        setGame(hit ?? 'missing')
        if (!hit) setCtx(undefined)
      })
      .catch((e: Error) => {
        if (stop) return
        setGame('missing')
        setNote(e.message)
        setCtx(undefined)
      })
    return () => { stop = true }
  }, [id])

  useEffect(() => {
    if (!game || game === 'missing') return
    let stop = false
    fetchGameContext(game)
      .then((detail) => { if (!stop) setCtx(detail) })
      .catch(() => { if (!stop) setCtx('error') })
    return () => { stop = true }
  }, [game])

  if (game === null) {
    return <section className="screen"><p className="loading">Loading the game</p></section>
  }
  if (game === 'missing') {
    return (
      <section className="screen">
        <div className="panel destination">
          <BackButton fallback="#games" label="Back to games" />
          <h2>That game is not on this week's board</h2>
          <p>{note ?? 'The scoreboard pull has no event with that id.'}</p>
          <p><a className="dest" href="#games">Open the week</a></p>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      <article className="panel destination gcard open">
        <header className="profile-head">
          <div className="profile-id">
            <h2>{game.away.name} at {game.home.name}</h2>
            <p className="pmeta">
              <TeamLink abbr={game.away.abbr}>{game.away.abbr}</TeamLink>
              <span>at</span>
              <TeamLink abbr={game.home.abbr}>{game.home.abbr}</TeamLink>
              <span>{game.detail}</span>
            </p>
          </div>
          <BackButton fallback="#games" label="Back to games" />
        </header>
        <GameDetail game={game} ctx={ctx} />
      </article>
    </section>
  )
}
