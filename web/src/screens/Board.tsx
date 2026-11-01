import { useEffect, useMemo, useState } from 'react'
import { fetchGameSummary, fetchScoreboard } from '../board/load'
import { pickCenter, rosterCounts, type DeskPlayer } from '../board/desk'
import type { Board as BoardData, BoardGame, GameContext } from '../board/normalize'
import { commitTarget } from '../board/search'
import { useOptionalEngine } from '../dataContext'
import { DeskFrame } from '../components/DeskFrame'
import { EmptyState, Skeleton } from '../components/glass'

function selectGame(id: string) {
  const next = `#game/${encodeURIComponent(id)}`
  if (window.location.hash !== next) window.location.hash = next
}

export function Board({ focusId }: { focusId: string | null }) {
  const engine = useOptionalEngine()
  const [board, setBoard] = useState<BoardData | null>(null)
  const [source, setSource] = useState<'live' | 'snapshot' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lineError, setLineError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ id: string; context: GameContext | null; raw: unknown } | null>(null)
  const [detailError, setDetailError] = useState(false)

  useEffect(() => {
    let stop = false
    const pull = (first: boolean) => {
      fetchScoreboard()
        .then(({ board: next, source: src }) => {
          if (stop) return
          setBoard(next)
          setSource(src)
          setError(null)
          setLineError(null)
        })
        .catch((e: Error) => {
          if (stop) return
          if (first) setError(e.message)
          else setLineError('the scoreboard did not refresh. This is the last board.')
        })
    }
    pull(true)
    const id = window.setInterval(() => pull(false), 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  const roster: DeskPlayer[] = useMemo(() => {
    if (!engine) return []
    const week = String(engine.d.meta.week)
    return engine.d.players
      .filter((p) => p.teamId === engine.d.meta.myTeamId && p.status === 'ONTEAM')
      .map((p) => ({ id: p.id, name: p.name, nfl: p.nfl, teamId: p.teamId, proj: p.proj[week] ?? null, espn: p.espnWeek }))
  }, [engine])

  const counts = useMemo(() => (board ? rosterCounts(board.games, roster, engine?.d.meta.myTeamId ?? -1) : {}), [board, roster, engine])
  const autoId = board ? pickCenter(board.games, counts) : null
  const selected = board?.games.find((game) => game.id === (focusId ?? autoId)) ?? null
  const missingId = focusId && board && !board.games.some((game) => game.id === focusId) ? focusId : null

  const commit = () => {
    if (!board) return
    const hit = commitTarget(board.games, query)
    if (hit) selectGame(hit)
  }

  const signature = selected ? `${selected.id}|${selected.state}|${selected.home.score}|${selected.away.score}|${selected.detail}` : ''

  useEffect(() => {
    if (!selected) return
    const game: BoardGame = selected
    let stop = false
    setDetailError(false)
    const pull = () => {
      fetchGameSummary(game)
        .then(({ context, raw }) => {
          if (stop) return
          setDetail({ id: game.id, context, raw })
          setDetailError(false)
        })
        .catch(() => {
          if (stop) return
          setDetailError(true)
          setDetail((cur) => (cur && cur.id === game.id ? cur : { id: game.id, context: null, raw: null }))
        })
    }
    pull()
    if (game.state !== 'in') return () => { stop = true }
    const timer = window.setInterval(pull, 15_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [signature, selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      e.preventDefault()
      document.getElementById('board-find')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error && !board) {
    return (
      <section className="screen">
        <EmptyState title="The board didn't answer" body={error}>
          <p className="news-next"><a className="dest" href="#team">Back to the desk</a></p>
        </EmptyState>
      </section>
    )
  }
  if (!board || !source) {
    return (
      <section className="screen">
        <Skeleton variant="rows" label="Loading the week" />
      </section>
    )
  }

  const shownDetail = detail && selected && detail.id === selected.id ? { context: detail.context, raw: detail.raw } : null

  return (
    <section className="screen board">
      <DeskFrame
        board={board}
        source={source}
        lineError={lineError}
        selected={selected}
        missingId={missingId}
        detail={shownDetail}
        detailError={detailError}
        query={query}
        onQuery={setQuery}
        onCommit={commit}
        onSelect={selectGame}
      />
    </section>
  )
}
