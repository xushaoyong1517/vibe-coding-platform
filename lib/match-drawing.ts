// 明细行 → 小样图 匹配：归一码分级打分（U2类型必同；U5结构/U4连接/U6密封/驱动/压力 加权），
// 中文字段(阀型+压力+驱动)兜底。纯函数可测。两侧都带 codes 时命中最精确。

export interface DrawingLike {
  id: string
  name?: string
  valve_type?: string
  pressure?: number
  actuator?: string
  dn_min: number
  dn_max: number
  codes?: Record<string, string>
  bom_template?: unknown[]
}

export interface ItemLike {
  类型?: string
  DN: number
  压力?: number
  驱动?: string
  codes?: Record<string, string>
}

/** 归一码命中分：U2 不同则淘汰(-1)；否则按结构/连接/密封/驱动/压力累计权重。 */
export function scoreDrawing(item: ItemLike, codes: Record<string, string> | undefined, d: DrawingLike): number {
  const ic = codes ?? item.codes
  const dc = d.codes
  if (!ic?.U2 || !dc?.U2 || ic.U2 !== dc.U2) return -1
  let s = 1                                            // 类型已对齐的底分
  if (ic.U5 && dc.U5 && ic.U5 === dc.U5) s += 8        // 结构最关键（闸/楔/平行…）
  if (ic.U4 && dc.U4 && ic.U4 === dc.U4) s += 4        // 连接（法兰/对焊…）
  if (ic.U6 && dc.U6 && ic.U6 === dc.U6) s += 2        // 密封面
  if (item.驱动 && d.actuator && item.驱动 === d.actuator) s += 2
  if (item.压力 && d.pressure && item.压力 === d.pressure) s += 1
  return s
}

export function matchDrawing<D extends DrawingLike>(
  item: ItemLike, drawings: D[], codes?: Record<string, string>,
): D | null {
  const pool = drawings.filter(d => item.DN >= d.dn_min && item.DN <= d.dn_max)
  const ic = codes ?? item.codes

  // ① 归一码分级匹配（最精确）
  if (ic?.U2) {
    let best: D | null = null, bestScore = 0
    for (const d of pool) {
      const sc = scoreDrawing(item, codes, d)
      if (sc > bestScore) { best = d; bestScore = sc }
    }
    if (best) return best
  }

  // ② 中文字段兜底：阀型+压力+驱动 → 阀型+压力
  return (
    pool.find(d => d.valve_type === item.类型 && d.pressure === item.压力 && d.actuator === item.驱动) ??
    pool.find(d => d.valve_type === item.类型 && d.pressure === item.压力) ??
    null
  )
}
