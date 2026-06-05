// 齐套工作台数据集：在 analyzeKitting(单层 BOM 炸开 + 按交期统筹扣减) 之上，
// 派生五视图所需的完整数据 —— 订单行(family/口径/优先级/状态分级)、缺料汇总、
// 分类×口径矩阵、客户汇总、在途时间线、KPI。纯函数，可单测。
//
// 在途采购(intransit)目前为「确定性合成」(按子件编码哈希)，仅用于演示在途视图；
// 接入真实 PO 在途字段后替换 synthInTransit 即可。UI 已明确标注「示意性在途数据」。

import { analyzeKitting, type KitOrderLine, type KitBomChild } from './kitting.ts'

const DAY = 86400000

// ── 输入 ────────────────────────────────────────────────
export interface WbLineInput {
  order: string                 // 订单编号
  seq?: number                  // 行号
  customer?: string
  pcode: string                 // 父件(产品)编码
  pname?: string
  pspec?: string                // 产品规格，如 Z40-600LB-WCB-DN100 → family/口径
  qty?: number                  // 订单数量
  openq: number                 // 未清/待排产数量(驱动需求)
  fg_stock?: number             // 成品库存(展示用)
  due?: string                  // 交期 yyyy-MM-dd
}
export interface WbChildMeta { name?: string; spec?: string; attr?: string }

// ── 输出 ────────────────────────────────────────────────
export type WbStatus = '齐套' | '部分齐套' | '全缺' | '无BOM'

export interface WbComp {
  code: string; name: string; spec: string; attr: string
  usage: number; need: number; alloc: number; onhand: number; gap: number
  _transitCover: number; _afterGap: number; _eta: string | null
}
export interface WbLine {
  _id: number
  order: string; customer: string; pcode: string; pname: string; pspec: string
  qty: number; openq: number; fg_stock: number; due: string | null
  status: WbStatus; has_bom: boolean
  total_items: number; short_items: number; rate: number
  model: string; family: string; caliber: string
  dleft: number | null; urgency: 'high' | 'mid' | 'low' | 'none'
  priority: number; transitKit: boolean; kitEta: string | null; kitEtaDays: number | null
  shortAfter: number
  comp: WbComp[]
}
export interface WbShortage {
  code: string; name: string; spec: string; attr: string
  demand: number; avail: number; net: number; orders: number
  intransit: number; eta: string | null; etaDays: number | null; po: string | null; afterNet: number
}
export interface WbMatrixCell {
  family: string; caliber: string; n: number; kit: number; partial: number; bad: number
  openq: number; ids: number[]
}
export interface WbCustomer {
  customer: string; n: number; kit: number; partial: number; bad: number; nobom: number
  openq: number; rate: number; buildable: number; transitKit: number; shortKinds: number
  nextDue: string | null; ids: number[]
}
export interface WbKpi {
  total: number; kit: number; partial: number; bad: number; nobom: number
  shortKinds: number; transitKit: number; openTotal: number; buyTotal: number; shipNow: number
}
export interface WorkbenchData {
  ref: string
  syncedAt?: string | null   // 黑湖接口数据同步时间(ISO)，由 API 注入
  lines: WbLine[]
  shortage: WbShortage[]
  matrix: Record<string, WbMatrixCell>
  usedFam: string[]; usedCal: string[]
  customers: WbCustomer[]
  transitLines: WbLine[]
  transitShipments: WbShortage[]
  kpi: WbKpi
}

// ── 产品族 / 口径解析 ─────────────────────────────────────
const FAMILY: Record<string, string> = {
  Z: '闸阀', J: '截止阀', Q: '球阀', H: '止回阀', D: '蝶阀', X: '旋塞阀', A: '安全阀', Y: '减压阀',
}
const CAL_ORDER = ['DN50', 'DN80', 'DN100', 'DN150', 'DN200', 'DN250', 'DN300', 'DN350', 'DN400', 'DN450', 'DN500', 'DN600', 'DN750', '其他']
const FAM_ORDER = ['闸阀', '截止阀', '止回阀', '球阀', '蝶阀', '其他']

function modelOf(pspec: string, pcode: string): string {
  const m = (pspec || pcode || '').match(/^([A-Z]+\d+)/)
  return m ? m[1] : '其他'
}
function familyOf(model: string): string { return FAMILY[(model || '')[0]] || '其他' }
function caliberOf(pspec: string): string {
  const m = (pspec || '').match(/DN\s*(\d+)/i)
  return m ? 'DN' + m[1] : '其他'
}

// 确定性哈希(FNV-1a)，用于合成在途 PO
function hash(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY)

/**
 * @param lines     销售订单明细行(未清数量驱动需求)
 * @param bom       父件编码 → 直接子件(单层)+用量
 * @param inventory 子件编码 → 现存数(原始，可为负；分配时按 max(0,·) 计)
 * @param childMeta 子件编码 → 名称/规格/属性(自制/外购)
 * @param refISO    参考基准日 yyyy-MM-dd(用于交期倒计时与在途 ETA)
 */
export function buildWorkbench(
  lines: WbLineInput[],
  bom: Record<string, KitBomChild[]>,
  inventory: Record<string, number>,
  childMeta: Record<string, WbChildMeta>,
  refISO: string,
): WorkbenchData {
  const REF = new Date(refISO)

  // ── 跑齐套引擎(按交期统筹扣减)。需求数量=openq；行号用全局索引保唯一以便回填。──
  const engineLines: KitOrderLine[] = lines.map((l, i) => ({
    订单号: l.order,
    行号: i,
    父件编码: l.pcode,
    父件名称: l.pname,
    需求数量: l.openq,
    交期: l.due,
    客户: l.customer,
  }))
  const invClamped: Record<string, number> = {}
  for (const [k, v] of Object.entries(inventory)) invClamped[k] = Math.max(0, v)
  const { results } = analyzeKitting(engineLines, bom, invClamped)
  const allocById = new Map<number, ReturnType<typeof analyzeKitting>['results'][number]>()
  for (const r of results) allocById.set(r.行号, r)

  // ── 派生每行 ──
  const out: WbLine[] = lines.map((l, i) => {
    const r = allocById.get(i)!
    const usageOf = new Map((bom[l.pcode] ?? []).map(c => [c.子件编码, c.用量]))
    const comp: WbComp[] = r.子件.map(c => {
      const meta = childMeta[c.子件编码] ?? {}
      return {
        code: c.子件编码,
        name: meta.name ?? c.子件名称 ?? '',
        spec: meta.spec ?? '',
        attr: meta.attr ?? '外购',
        usage: usageOf.get(c.子件编码) ?? 1,
        need: c.需求,
        alloc: c.可用,
        onhand: inventory[c.子件编码] ?? 0,
        gap: c.缺口,
        _transitCover: 0, _afterGap: c.缺口, _eta: null,
      }
    })
    const has_bom = r.状态 !== '无BOM'
    const total = comp.length
    const short = comp.filter(c => c.gap > 0).length
    const rate = total ? Math.round(((total - short) / total) * 100) : 0
    const status: WbStatus = !has_bom ? '无BOM' : short === 0 ? '齐套' : short === total ? '全缺' : '部分齐套'
    const model = modelOf(l.pspec ?? '', l.pcode)
    const due = l.due ?? null
    const dleft = due ? daysBetween(new Date(due), REF) : null
    const urgency: WbLine['urgency'] = dleft == null ? 'none' : dleft <= 14 ? 'high' : dleft <= 30 ? 'mid' : 'low'
    return {
      _id: i,
      order: l.order, customer: l.customer ?? '', pcode: l.pcode, pname: l.pname ?? '', pspec: l.pspec ?? '',
      qty: l.qty ?? l.openq, openq: l.openq, fg_stock: l.fg_stock ?? 0, due,
      status, has_bom, total_items: total, short_items: short, rate,
      model, family: familyOf(model), caliber: caliberOf(l.pspec ?? ''),
      dleft, urgency,
      priority: 0, transitKit: false, kitEta: null, kitEtaDays: null, shortAfter: short,
      comp,
    }
  })

  // ── 缺料汇总(按子件编码跨订单)：demand=Σ需求, avail=max(0,原始库存), net=max(0,demand-avail), orders=有缺口的订单数 ──
  const shortAcc = new Map<string, { demand: number; orders: Set<string> }>()
  for (const l of out) {
    for (const c of l.comp) {
      const a = shortAcc.get(c.code) ?? { demand: 0, orders: new Set<string>() }
      a.demand += c.need
      if (c.gap > 0) a.orders.add(l.order)
      shortAcc.set(c.code, a)
    }
  }
  let shortage: WbShortage[] = []
  for (const [code, a] of shortAcc) {
    const avail = Math.max(0, inventory[code] ?? 0)
    const net = Math.max(0, a.demand - avail)
    if (net <= 0) continue
    const meta = childMeta[code] ?? {}
    shortage.push({
      code, name: meta.name ?? '', spec: meta.spec ?? '', attr: meta.attr ?? '外购',
      demand: a.demand, avail, net, orders: a.orders.size,
      ...synthInTransit(code, net, REF),
    })
  }
  shortage.sort((a, b) => b.orders - a.orders || b.net - a.net)

  // ── 在途分配到具体订单子件(早交期优先) ──
  const shortByCode = new Map(shortage.map(s => [s.code, s]))
  const instances: { line: WbLine; comp: WbComp }[] = []
  out.forEach(l => l.comp.forEach(c => { if (c.gap > 0) instances.push({ line: l, comp: c }) }))
  instances.sort((a, b) => (a.line.dleft ?? 1e9) - (b.line.dleft ?? 1e9))
  const remaining: Record<string, number> = {}
  shortByCode.forEach(s => { remaining[s.code] = s.intransit })
  for (const { comp } of instances) {
    const avail = remaining[comp.code] ?? 0
    const take = Math.min(avail, comp.gap)
    comp._transitCover = take
    comp._afterGap = comp.gap - take
    comp._eta = take > 0 ? (shortByCode.get(comp.code)?.eta ?? null) : null
    remaining[comp.code] = avail - take
  }
  // 每行：在途到货后是否转为可齐套
  for (const l of out) {
    if (!l.has_bom || l.short_items === 0) continue
    const shortComps = l.comp.filter(c => c.gap > 0)
    const stillShort = shortComps.filter(c => c._afterGap > 0)
    l.shortAfter = stillShort.length
    if (stillShort.length === 0 && shortComps.length > 0) {
      l.transitKit = true
      const etas = shortComps.map(c => c._eta).filter(Boolean).sort() as string[]
      l.kitEta = etas[etas.length - 1] ?? null
      l.kitEtaDays = l.kitEta ? daysBetween(new Date(l.kitEta), REF) : null
    }
  }

  // ── 优先级评分(越高越先做) ──
  for (const l of out) {
    let s = 0
    if (l.status === '齐套') s += 1000
    else if (l.transitKit) s += 600
    else if (l.status === '部分齐套') s += 300 + l.rate * 1.5
    if (l.dleft != null) s += Math.max(0, 200 - l.dleft)
    s += Math.min(l.openq, 50)
    l.priority = Math.round(s)
  }

  // ── 分类×口径矩阵 ──
  const matrix: Record<string, WbMatrixCell> = {}
  for (const l of out) {
    const key = l.family + '||' + l.caliber
    const m = (matrix[key] ??= { family: l.family, caliber: l.caliber, n: 0, kit: 0, partial: 0, bad: 0, openq: 0, ids: [] })
    m.n++; m.openq += l.openq; m.ids.push(l._id)
    if (l.status === '齐套') m.kit++
    else if (l.status === '部分齐套') m.partial++
    else if (l.status === '全缺') m.bad++
  }
  const usedCal = CAL_ORDER.filter(c => out.some(l => l.caliber === c))
  const usedFam = FAM_ORDER.filter(f => out.some(l => l.family === f))

  // ── 按客户汇总 ──
  const custMap = new Map<string, WbCustomer & { _rateSum: number; _short: Set<string> }>()
  for (const l of out) {
    const c = custMap.get(l.customer) ?? {
      customer: l.customer, n: 0, kit: 0, partial: 0, bad: 0, nobom: 0, openq: 0,
      rate: 0, buildable: 0, transitKit: 0, shortKinds: 0, nextDue: null, ids: [],
      _rateSum: 0, _short: new Set<string>(),
    }
    c.n++; c.openq += l.openq; c._rateSum += (l.has_bom ? l.rate : 0); c.ids.push(l._id)
    if (l.status === '齐套') c.kit++
    else if (l.status === '部分齐套') c.partial++
    else if (l.status === '全缺') c.bad++
    else c.nobom++
    if (l.transitKit) c.transitKit++
    l.comp.forEach(x => { if (x.gap > 0) c._short.add(x.code) })
    if (l.due && (!c.nextDue || l.due < c.nextDue)) c.nextDue = l.due
    custMap.set(l.customer, c)
  }
  const customers: WbCustomer[] = [...custMap.values()].map(c => ({
    customer: c.customer, n: c.n, kit: c.kit, partial: c.partial, bad: c.bad, nobom: c.nobom,
    openq: c.openq, rate: c.n ? Math.round(c._rateSum / c.n) : 0, buildable: c.kit,
    transitKit: c.transitKit, shortKinds: c._short.size, nextDue: c.nextDue, ids: c.ids,
  }))

  // ── 在途时间线 ──
  const transitLines = out.filter(l => l.transitKit).sort((a, b) => (a.kitEtaDays ?? 0) - (b.kitEtaDays ?? 0))
  const transitShipments = shortage.filter(s => s.intransit > 0).sort((a, b) => (a.etaDays ?? 0) - (b.etaDays ?? 0))

  // ── KPI ──
  const cnt = (st: WbStatus) => out.filter(l => l.status === st).length
  const kpi: WbKpi = {
    total: out.length, kit: cnt('齐套'), partial: cnt('部分齐套'), bad: cnt('全缺'), nobom: cnt('无BOM'),
    shortKinds: shortage.length, transitKit: transitLines.length,
    openTotal: out.reduce((a, l) => a + l.openq, 0),
    buyTotal: shortage.reduce((a, s) => a + s.afterNet, 0),
    shipNow: transitShipments.length,
  }

  return { ref: refISO, lines: out, shortage, matrix, usedFam, usedCal, customers, transitLines, transitShipments, kpi }
}

// 合成在途：~42% 缺料子件有在途 PO 覆盖部分/全部净缺口。接真实在途后整体替换。
function synthInTransit(code: string, net: number, REF: Date): {
  intransit: number; eta: string | null; etaDays: number | null; po: string | null; afterNet: number
} {
  const h = hash(code), r = h % 100
  if (r < 42 && net > 0) {
    const ratio = r < 16 ? 1 : 0.45 + (h % 45) / 100
    const intransit = Math.min(net, Math.ceil(net * ratio))
    const etaDays = 4 + (h % 46)
    const eta = fmtDate(new Date(REF.getTime() + etaDays * DAY))
    return { intransit, eta, etaDays, po: 'PO-' + (1000 + (h % 9000)), afterNet: Math.max(0, net - intransit) }
  }
  return { intransit: 0, eta: null, etaDays: null, po: null, afterNet: net }
}
