// 齐套分析引擎：单层 BOM 炸开 + 多订单按交期统筹扣减库存。纯函数，可单测。
//
// 输入：销售订单明细行 + BOM(父→子,单层) + 库存余额(按子件编码)
// 逻辑：按交期升序(早交期优先)依次从库存扣减；每行算齐套/缺料 + 缺口清单。
// 输出：每行状态(齐套/缺料/无BOM) + 各子件分配明细 + 扣减后剩余库存。

export interface KitOrderLine {
  订单号: string
  行号: number
  父件编码: string
  父件名称?: string
  需求数量: number
  交期?: string        // ISO 'yyyy-MM-dd'，缺省排最后
  客户?: string
}

export interface KitBomChild {
  子件编码: string
  子件名称?: string
  用量: number          // 单位用量（每个父件需要多少子件）
}

export interface KitChildAlloc {
  子件编码: string
  子件名称?: string
  需求: number
  可用: number          // 本行实际分配到的量
  缺口: number          // 需求 - 可用，>0 即缺料
}

export interface KitResult extends KitOrderLine {
  状态: '齐套' | '缺料' | '无BOM'
  子件: KitChildAlloc[]
}

const FAR = '9999-99-99'

/**
 * @param lines     销售订单明细行
 * @param bom       父件编码 → 直接子件(单层)
 * @param inventory 子件编码 → 现存总数
 */
export function analyzeKitting(
  lines: KitOrderLine[],
  bom: Record<string, KitBomChild[]>,
  inventory: Record<string, number>,
): { results: KitResult[]; remaining: Record<string, number> } {
  const avail: Record<string, number> = { ...inventory }   // 剩余库存（边扣边减）

  // 早交期优先；同交期按订单号、行号稳定排序
  const sorted = [...lines].sort((a, b) =>
    (a.交期 ?? FAR).localeCompare(b.交期 ?? FAR) ||
    a.订单号.localeCompare(b.订单号) ||
    a.行号 - b.行号)

  const results: KitResult[] = []
  for (const line of sorted) {
    const children = bom[line.父件编码]
    if (!children || children.length === 0) {
      results.push({ ...line, 状态: '无BOM', 子件: [] })
      continue
    }
    const rows: KitChildAlloc[] = []
    let short = false
    for (const c of children) {
      const 需求 = line.需求数量 * c.用量
      const have = avail[c.子件编码] ?? 0
      const 可用 = Math.min(需求, have)
      avail[c.子件编码] = have - 可用                     // 统筹扣减：本行先占
      const 缺口 = 需求 - 可用
      if (缺口 > 0) short = true
      rows.push({ 子件编码: c.子件编码, 子件名称: c.子件名称, 需求, 可用, 缺口 })
    }
    results.push({ ...line, 状态: short ? '缺料' : '齐套', 子件: rows })
  }
  return { results, remaining: avail }
}

/** 汇总：齐套/缺料/无BOM 各多少行，以及全部缺口子件合并清单（便于一键采购）。 */
export function summarizeKitting(results: KitResult[]): {
  齐套: number; 缺料: number; 无BOM: number
  缺口清单: { 子件编码: string; 子件名称?: string; 缺口合计: number }[]
} {
  const counts = { 齐套: 0, 缺料: 0, 无BOM: 0 }
  const gap = new Map<string, { 子件编码: string; 子件名称?: string; 缺口合计: number }>()
  for (const r of results) {
    counts[r.状态]++
    for (const c of r.子件) {
      if (c.缺口 <= 0) continue
      const g = gap.get(c.子件编码) ?? { 子件编码: c.子件编码, 子件名称: c.子件名称, 缺口合计: 0 }
      g.缺口合计 += c.缺口
      gap.set(c.子件编码, g)
    }
  }
  return { ...counts, 缺口清单: [...gap.values()].sort((a, b) => b.缺口合计 - a.缺口合计) }
}
