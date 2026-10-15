import { createContext, useContext, type ReactNode } from 'react'
import type { Engine } from './useEngine'

const Ctx = createContext<Engine | null>(null)

export function DataProvider({ engine, children }: { engine: Engine; children: ReactNode }) {
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>
}

export function useEngineCtx(): Engine {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEngineCtx outside DataProvider')
  return c
}

export function useData() {
  return useEngineCtx().d
}
