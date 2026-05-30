// 事件流类型 + 纯函数辅助。前后端共用。

export type EventType = 'bom_generated' | 'bom_confirmed' | 'quote_confirmed' | 'parameters_extracted'

export interface EventInput {
  event_type: EventType
  actor?: string
  correlation_id?: string
  quote_id?: string
  valve_spec?: string
  refs?: Record<string, unknown>
  payload?: Record<string, unknown>
  provenance?: Record<string, unknown>
}

/** BOM 行（与前端 BOMRow / 后端 BomLine 同构的最小子集） */
export interface BomRowLike {
  序号?: number
  零件: string
  材质: string
  数量: number | string
}

/** 行级 delta：哪一行的哪个字段，从系统值改成了人工值 */
export interface BomDelta {
  零件: string
  field: '材质' | '数量' | '新增' | '删除'
  system_value: string | number | null
  human_value: string | number | null
}

/**
 * 阀型分组键：BOM 材质身份 = 类型·主体·件号#。
 * 同一配置跨 DN/客户聚合，是「阀门对象」累积纠错的粒度。
 */
export function valveSpec(item: { 类型?: string; 主体?: string; 件号?: string }): string {
  const t = (item.类型 || '?').trim()
  const b = (item.主体 || '?').trim()
  const j = (item.件号 || '?').toString().replace(/#/g, '').trim()
  return `${t}·${b}·${j}#`
}

/** 计算系统提议 → 人工确认的行级 delta（按零件名对齐） */
export function diffBomRows(before: BomRowLike[], after: BomRowLike[]): BomDelta[] {
  const deltas: BomDelta[] = []
  const byName = (arr: BomRowLike[]) => {
    const m = new Map<string, BomRowLike>()
    arr.forEach((r) => m.set(r.零件, r))
    return m
  }
  const a = byName(before)
  const b = byName(after)

  for (const [name, bRow] of b) {
    const aRow = a.get(name)
    if (!aRow) {
      deltas.push({ 零件: name, field: '新增', system_value: null, human_value: bRow.材质 })
      continue
    }
    if (String(aRow.材质) !== String(bRow.材质))
      deltas.push({ 零件: name, field: '材质', system_value: aRow.材质, human_value: bRow.材质 })
    if (String(aRow.数量) !== String(bRow.数量))
      deltas.push({ 零件: name, field: '数量', system_value: aRow.数量, human_value: bRow.数量 })
  }
  for (const [name, aRow] of a) {
    if (!b.has(name))
      deltas.push({ 零件: name, field: '删除', system_value: aRow.材质, human_value: null })
  }
  return deltas
}
