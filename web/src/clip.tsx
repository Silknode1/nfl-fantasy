import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  idlePlayback,
  leaveCenter,
  pauseCenter,
  pauseShelf,
  pinClipPauses,
  playCenter,
  playShelf,
  type Playback,
} from './board/desk'

export interface LiveSpot {
  gameId: string | null
  index: number
  seconds: number
}

interface ClipApi {
  play: Playback
  spot: () => LiveSpot
  setSpot: (spot: LiveSpot) => void
  /** Reads the live playhead when a YouTube player is mounted. */
  timeRead: { current: (() => number) | null }
  startCenter: (gameId: string) => void
  stopCenter: (gameId: string, index: number, seconds: number) => void
  exitCenter: (gameId: string, index: number, seconds: number) => void
  startShelf: (videoId: string) => void
  stopShelf: () => void
  pauseForPin: (gameId: string, index: number, seconds: number) => void
}

const Ctx = createContext<ClipApi | null>(null)

export function ClipProvider({ children }: { children: ReactNode }) {
  const [play, setPlay] = useState<Playback>(idlePlayback)
  const spotRef = useRef<LiveSpot>({ gameId: null, index: 0, seconds: 0 })
  const timeRead = useRef<(() => number) | null>(null)
  const setSpot = useCallback((spot: LiveSpot) => {
    spotRef.current = spot
  }, [])
  const startCenter = useCallback((gameId: string) => setPlay((cur) => playCenter(cur, gameId)), [])
  const stopCenter = useCallback((gameId: string, index: number, seconds: number) => {
    setPlay((cur) => pauseCenter(cur, gameId, index, seconds))
  }, [])
  const exitCenter = useCallback((gameId: string, index: number, seconds: number) => {
    setPlay((cur) => leaveCenter(cur, gameId, index, seconds))
  }, [])
  const startShelf = useCallback((videoId: string) => {
    const here = spotRef.current
    const seconds = timeRead.current?.() ?? here.seconds
    setPlay((cur) => playShelf(cur, videoId, here.gameId, here.index, seconds))
  }, [])
  const stopShelf = useCallback(() => setPlay((cur) => pauseShelf(cur)), [])
  const pauseForPin = useCallback((gameId: string, index: number, seconds: number) => {
    const here = spotRef.current
    const secondsNow = timeRead.current?.() ?? seconds
    const at = here.gameId === gameId ? here.index : index
    setPlay((cur) => pinClipPauses(cur, gameId, at, secondsNow))
  }, [])
  const api = useMemo<ClipApi>(() => ({
    play,
    spot: () => spotRef.current,
    setSpot,
    timeRead,
    startCenter,
    stopCenter,
    exitCenter,
    startShelf,
    stopShelf,
    pauseForPin,
  }), [play, setSpot, startCenter, stopCenter, exitCenter, startShelf, stopShelf, pauseForPin])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useClips(): ClipApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClips outside ClipProvider')
  return ctx
}
