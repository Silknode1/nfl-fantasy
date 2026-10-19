import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { dropPin, pushPin } from './board/desk'
import type { Player } from './types'

export type ShelfPin =
  | { kind: 'player'; id: string; player: Player }
  | { kind: 'video'; id: string; videoId: string; title: string }
  | { kind: 'news'; id: string; headline: string; summary: string | null; href: string | null }
  | { kind: 'team'; id: string; abbr: string; name: string }
  | { kind: 'article'; id: string; gameId: string; title: string; paragraphs: string[] }

/**
 * Numbered badges: each screen registers the players it shows, in order.
 * The badge number on a photo and the number in the stat rail are the same index,
 * and hovering either one lights up both.
 */
interface FocusState {
  list: Player[]
  setList: (ps: Player[]) => void
  hover: string | null
  setHover: (id: string | null) => void
  /** The player whose chart is open. Pinning adds; it does not clear the stack. */
  pinned: Player | null
  pins: ShelfPin[]
  pin: (item: ShelfPin) => void
  unpin: (id: string) => void
  openPlayer: (id: string) => void
  setPinned: (p: Player | null) => void
  numberOf: (id: string) => number | null
}

const Ctx = createContext<FocusState | null>(null)

export function FocusProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Player[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [pins, setPins] = useState<ShelfPin[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const pin = (item: ShelfPin) => {
    setPins((cur) => pushPin(cur, item))
    if (item.kind === 'player') setOpenId(item.id)
  }
  const unpin = (id: string) => {
    setPins((cur) => dropPin(cur, id))
    setOpenId((cur) => (cur === id ? null : cur))
  }
  const openPlayer = (id: string) => setOpenId(id)
  const setPinned = (p: Player | null) => {
    if (!p) {
      setPins((cur) => {
        const id = openId ?? cur.find((item) => item.kind === 'player')?.id
        return id ? dropPin(cur, id) : cur
      })
      setOpenId(null)
      return
    }
    pin({ kind: 'player', id: p.id, player: p })
  }
  const pinned = (() => {
    const players = pins.filter((item): item is Extract<ShelfPin, { kind: 'player' }> => item.kind === 'player')
    return players.find((item) => item.id === openId)?.player ?? players[0]?.player ?? null
  })()
  const numberOf = (id: string) => {
    const i = list.findIndex((p) => p.id === id)
    return i >= 0 ? i + 1 : null
  }
  return (
    <Ctx.Provider value={{ list, setList, hover, setHover, pinned, pins, pin, unpin, openPlayer, setPinned, numberOf }}>
      {children}
    </Ctx.Provider>
  )
}

export function useFocus() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFocus outside FocusProvider')
  return c
}

/** Games can render before the league file, and then there is no shelf. */
export function useOptionalFocus() {
  return useContext(Ctx)
}

/** Register this screen's numbered players (stable by id list). */
export function useNumbered(ps: Player[]) {
  const { setList } = useFocus()
  const key = ps.map((p) => p.id).join(',')
  useEffect(() => {
    setList(ps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
