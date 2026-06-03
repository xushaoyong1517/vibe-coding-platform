// 报价单状态机：全生命周期 + 合法流转 + 守卫 + 时间戳键。纯函数，前后端共用、可测。
//
//   草稿 → 已发送 → 已确认 → 已下单(赢，定价真值)
//                      ↘ 已失单(输，失单学习)
//   (任意非终态 → 作废)

export const QUOTE_STATUSES = ['草稿', '已发送', '已确认', '已下单', '已失单', '作废'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export interface StatusMeta {
  color: string
  terminal: boolean          // 终态不可再流转
  ts?: string                // 进入该态时打的时间戳键（存于 quote.data）
  truth?: 'won' | 'lost'     // 喂定价飞轮的成交真值
}

export const STATUS_META: Record<QuoteStatus, StatusMeta> = {
  草稿:   { color: '#7a7a70', terminal: false },
  已发送: { color: '#2c6fbb', terminal: false, ts: 'sent_at' },
  已确认: { color: '#b8860b', terminal: false, ts: 'confirmed_at' },
  已下单: { color: '#2a7a4b', terminal: true,  ts: 'won_at',    truth: 'won'  },
  已失单: { color: '#c0392b', terminal: true,  ts: 'lost_at',   truth: 'lost' },
  作废:   { color: '#9a9a90', terminal: true,  ts: 'voided_at' },
}

// 允许的下一状态
const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  草稿:   ['已发送', '作废'],
  已发送: ['已确认', '已失单', '草稿', '作废'],   // 可退回草稿改单
  已确认: ['已下单', '已失单', '作废'],
  已下单: [],
  已失单: [],
  作废:   [],
}

export function isStatus(s: unknown): s is QuoteStatus {
  return typeof s === 'string' && (QUOTE_STATUSES as readonly string[]).includes(s)
}

export function nextStates(from: string): QuoteStatus[] {
  return isStatus(from) ? TRANSITIONS[from] : ['草稿']
}

export function canTransition(from: string, to: string): boolean {
  return isStatus(to) && nextStates(from).includes(to)
}

export function isTerminal(s: string): boolean {
  return isStatus(s) ? STATUS_META[s].terminal : false
}

export const STATUS_COLOR: Record<string, string> =
  Object.fromEntries(QUOTE_STATUSES.map(s => [s, STATUS_META[s].color]))

/** 业务守卫：返回阻止原因字符串，null 表示放行。 */
export function transitionBlockReason(
  to: string, ctx: { hasBom?: boolean },
): string | null {
  if (to === '已发送' && !ctx.hasBom) return '需先生成 BOM 才能发送给客户'
  return null
}
