// 与历史产品库匹配 + 置信度 + 历史补缺。纯函数 —— products 由调用方传入，可单测。
// 来源：valve_products（19码 + 下单次数）。核心6=U2/U5/U6/U7/U8/U9，核心4=U2/U7/U8/U9。

export interface ProductRow {
  U2?: string; U5?: string; U6?: string; U7?: string; U8?: string; U9?: number | string
  下单次数?: number; full_code?: string; [k: string]: unknown
}

export const CORE6 = ['U2', 'U5', 'U6', 'U7', 'U8', 'U9'] as const
export const CORE4 = ['U2', 'U7', 'U8', 'U9'] as const

export interface MatchResult {
  level: 'exact' | 'similar' | 'none'
  count: number              // 命中集合的「下单次数」之和（历史出现次数）
  rows: number               // 命中行数
  topCode: string | null     // 最高频命中的 full_code
  filledFields: string[]     // 由历史补缺/补充的核心字段（U5/U6 等）
  prefill: Record<string, string>  // 这些字段的历史最常见值
}

const eq = (p: ProductRow, codes: Record<string, string>, k: string) =>
  String(p[k] ?? '') === String(codes[k])

/** 在命中集合里按「下单次数」加权取某字段的众数 */
function weightedMode(rows: ProductRow[], key: string): string | null {
  const w = new Map<string, number>()
  for (const r of rows) {
    const v = String(r[key] ?? '')
    if (!v) continue
    w.set(v, (w.get(v) ?? 0) + (Number(r.下单次数) || 1))
  }
  let best: string | null = null, max = -1
  for (const [v, n] of w) if (n > max) { max = n; best = v }
  return best
}

const sumOrders = (rows: ProductRow[]) => rows.reduce((s, r) => s + (Number(r.下单次数) || 0), 0)
const topRow = (rows: ProductRow[]) => [...rows].sort((a, b) => (Number(b.下单次数) || 0) - (Number(a.下单次数) || 0))[0]

/**
 * codes: normalizeItem 产出的标准码子集（通常含 U2/U7/U8/U9，可能含 U5/U6）。
 *   exact   = 核心6全给且全命中
 *   similar = 核心4命中（U5/U6 缺或不同，用历史补缺）
 *   none    = 核心4无命中（退到 类型+阀体 给松散建议）
 */
export function matchProduct(codes: Record<string, string>, products: ProductRow[]): MatchResult {
  const present = (k: string) => codes[k] !== undefined && codes[k] !== ''
  const empty: MatchResult = { level: 'none', count: 0, rows: 0, topCode: null, filledFields: [], prefill: {} }
  if (!CORE4.every(present)) return empty

  const present6 = CORE6.filter(present)               // 在场的核心字段（≥核心4）
  const allCore6Present = CORE6.every(present)

  // 用"在场的核心6"全部收窄
  const hits = products.filter(p => present6.every(k => eq(p, codes, k)))
  if (hits.length > 0) {
    const prefill: Record<string, string> = {}
    for (const k of CORE6) if (!present(k)) { const m = weightedMode(hits, k); if (m) prefill[k] = m }
    return {
      level: allCore6Present ? 'exact' : 'similar',
      count: sumOrders(hits), rows: hits.length, topCode: topRow(hits)?.full_code ?? null,
      filledFields: Object.keys(prefill), prefill,
    }
  }

  // 收窄无命中 → 退到核心4
  const hits4 = products.filter(p => CORE4.every(k => eq(p, codes, k)))
  if (hits4.length > 0) {
    const prefill: Record<string, string> = {}
    for (const k of ['U5', 'U6'] as const) { const m = weightedMode(hits4, k); if (m) prefill[k] = m }
    return { level: 'similar', count: sumOrders(hits4), rows: hits4.length, topCode: topRow(hits4)?.full_code ?? null, filledFields: Object.keys(prefill), prefill }
  }

  // 核心4也无命中 → 按 类型+阀体 给常见值参考
  const loose = products.filter(p => eq(p, codes, 'U2') && eq(p, codes, 'U8'))
  if (loose.length === 0) return empty
  const prefill: Record<string, string> = {}
  for (const k of ['U7', 'U9', 'U5', 'U6']) { const m = weightedMode(loose, k); if (m) prefill[k] = m }
  return { level: 'none', count: sumOrders(loose), rows: loose.length, topCode: topRow(loose)?.full_code ?? null, filledFields: Object.keys(prefill), prefill }
}
