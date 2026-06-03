// 参数归一化（权威，查阀门参数库词典）。纯函数 —— units 由调用方传入，可单测。

export interface ParamEntry { code: string; cn: string; short?: string; en?: string; note?: string; aliases: string[] }
export interface ParamUnit { unit: string; name_cn: string; tier: string; is_core6: boolean; entries: ParamEntry[] }
export type ParamUnits = Record<string, ParamUnit>

// 提取字段 → 参数单元（直接可映射的）。件号(牌2)/结构按需另处理。
export const FIELD_TO_UNIT: Record<string, string> = {
  类型: 'U2', 压力: 'U7', 主体: 'U8', DN: 'U9', 结构: 'U5',
}

export type MatchVia = 'code' | 'cn' | 'alias' | 'none'

/** 把单个原始值归一化到某单元的标准码。优先级：标准码 → 中文名 → 别名 → 无 */
export function normalizeField(entries: ParamEntry[], raw: string | number): { code: string; cn: string; via: MatchVia } {
  const r = String(raw ?? '').trim().toLowerCase()
  if (!r) return { code: '', cn: '', via: 'none' }
  for (const e of entries) if (e.code.toLowerCase() === r) return { code: e.code, cn: e.cn, via: 'code' }
  for (const e of entries) if (e.cn.toLowerCase() === r) return { code: e.code, cn: e.cn, via: 'cn' }
  for (const e of entries) if (e.aliases.some(a => a.toLowerCase() === r)) return { code: e.code, cn: e.cn, via: 'alias' }
  return { code: '', cn: '', via: 'none' }
}

export interface NormalizedItem {
  codes: Record<string, string>         // unit → 标准码（命中的）
  cn: Record<string, string>            // unit → 标准中文名
  status: Record<string, MatchVia>      // field → 命中方式
  unmatched: string[]                   // 未归一化（待确认）的字段
}

/**
 * 从材质串/件号启发式推导密封面 U6（提取通常无独立密封面字段）。
 * 优先看阀座/阀瓣材质，再用件号兜底。返回 U6 码或 null。
 */
export function deriveU6(item: Record<string, unknown>): string | null {
  const blob = `${item.阀座 ?? ''} ${item.阀瓣阀闸 ?? ''}`.toLowerCase()
  if (/stl|硬面|堆焊|\bhf\b|stellite|司太立/.test(blob)) return 'Y'   // 硬面堆焊（产品库主力）
  if (/monel|蒙乃尔/.test(blob)) return 'M'
  if (/13cr|cr13|f6a/.test(blob)) return 'H'                         // 13Cr 铁基
  if (/本体|同本体/.test(blob)) return 'W'
  // 件号兜底
  const j = String(item.件号 ?? '').replace(/#/g, '').trim()
  if (['5', '8', '15', '16', '11', '12', '14', '18'].includes(j)) return 'Y'  // 堆焊类
  if (['1', '4', '7'].includes(j)) return 'H'                                  // 13Cr 类
  if (['2', '3', '10'].includes(j)) return 'W'                                 // 本体类
  return null
}

/** 归一化一条提取参数（按 FIELD_TO_UNIT 映射的字段） */
export function normalizeItem(item: Record<string, unknown>, units: ParamUnits, mapping: Record<string, string> = FIELD_TO_UNIT): NormalizedItem {
  const codes: Record<string, string> = {}
  const cn: Record<string, string> = {}
  const status: Record<string, MatchVia> = {}
  const unmatched: string[] = []
  for (const [field, unit] of Object.entries(mapping)) {
    const raw = item[field]
    if (raw === undefined || raw === null || raw === '') continue
    const u = units[unit]
    if (!u) continue
    const res = normalizeField(u.entries, raw as string | number)
    status[field] = res.via
    if (res.via === 'none') unmatched.push(field)
    else { codes[unit] = res.code; cn[unit] = res.cn }
  }
  return { codes, cn, status, unmatched }
}
