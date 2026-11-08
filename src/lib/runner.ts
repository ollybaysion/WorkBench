import type { Connection, QueryCard, QueryResult } from '../types'
import { fixtures } from './fixtures'

/** 서버가 자르는 행 상한 */
export const ROW_CAP = 10000

/** 카드 하나를 돌린다. 페이지는 이 인터페이스만 쓴다 — 6 단계에서 서버 실행기로 바꿔 끼운다 */
export interface Runner {
  run(card: QueryCard, conn: Connection, vars: Record<string, string>): Promise<QueryResult>
}

/** 페이지가 들고 있는 카드별 조회 상태. IndexedDB 에 저장하지 않는다 */
export type QueryState = { status: 'loading' } | { status: 'ok'; result: QueryResult; at: string } | { status: 'error'; message: string; at: string }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 가짜 실행기: fixtures 의 카드 id 별 결과를 소요 시간만큼 기다린 뒤 돌려준다 */
export const fixtureRunner: Runner = {
  async run(card) {
    const f = fixtures[card.id]
    if (!f) throw new Error(`가짜 결과가 없는 카드입니다: ${card.id}`)
    await sleep(f.delayMs)
    if ('error' in f) throw new Error(f.error)
    return f.result
  },
}
