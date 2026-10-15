import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Player } from './types'

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
  pinned: Player | null
  setPinned: (p: Player | null) => void
  numberOf: (id: string) => number | null
}

const Ctx = createContext<FocusState | null>(null)

export function FocusProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Player[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<Player | null>(null)
  const numberOf = (id: string) => {
    const i = list.findIndex((p) => p.id === id)
    return i >= 0 ? i + 1 : null
  }
  return <Ctx.Provider value={{ list, setList, hover, setHover, pinned, setPinned, numberOf }}>{children}</Ctx.Provider>
}

export function useFocus() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFocus outside FocusProvider')
  return c
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
