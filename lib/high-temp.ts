// 高温工况确定性规则：把"≥阈值 → 阀杆升 H 级 + 加长阀盖/散热片"从 prompt 提示落成纯函数。
// 纯函数、无副作用、可单测。来源：ASME 高温蠕变 H 级控碳要求 + 阀门高温结构惯例。

/** 奥氏体不锈钢取 H 级（控碳、抗蠕变）的温度阈值(℃)。650℃ 远超此值。 */
export const H_GRADE_C = 525
/** 需加长阀盖 + 散热片（保护填料/降低阀杆温度）的温度阈值(℃)。 */
export const EXT_BONNET_C = 425

/** 从特殊/备注文本解析工况温度(℃)。支持 "650℃" "使用温度650度" "工况650" "T=650C" 等。 */
export function parseTempC(text: string | undefined | null): number | null {
  if (!text) return null
  const t = String(text)
  // 1) 数字 + 明确温度单位（℃ / °C / 度 / 摄氏）
  let m = t.match(/(-?\d{2,4})\s*(?:℃|°\s*c|度|摄氏度?|deg\s*c)/i)
  if (m) return Number(m[1])
  // 2) "温度" 关键字后的数字
  m = t.match(/温度\s*[:：]?\s*(-?\d{2,4})/)
  if (m) return Number(m[1])
  // 3) 数字 + 单独字母 C（如 650C / T=650C）
  m = t.match(/(?:^|[^a-z0-9])(-?\d{2,4})\s*c\b/i)
  if (m) return Number(m[1])
  return null
}

/** 该阀杆材质是否为"奥氏体不锈钢但未带 H 级"（需要升 H 的对象）。13Cr/F6a/F11/Monel 等不在此列。 */
export function isAusteniticNonH(stem: string | undefined): boolean {
  const v = String(stem ?? '').toUpperCase()
  if (/30\d\s*H|31\d\s*H|32\d\s*H|34\d\s*H/.test(v)) return false  // 已是 H 级
  if (/304L|316L/.test(v)) return false                            // L 级（低碳，与 H 互斥）
  return /(^|[^0-9])(304|316|321|347)([^0-9]|$)/.test(v)
}

/** 阀杆材质升 H 级：F304→F304H、F316→F316H 等；非奥氏体或已 H 级则原样返回（幂等）。 */
export function hGradeStem(stem: string | undefined): string {
  const s = String(stem ?? '')
  if (!isAusteniticNonH(s)) return s
  const v = s.toUpperCase()
  if (/(^|[^0-9])304([^0-9]|$)/.test(v)) return 'F304H'
  if (/(^|[^0-9])316([^0-9]|$)/.test(v)) return 'F316H'
  if (/(^|[^0-9])321([^0-9]|$)/.test(v)) return 'F321H'
  if (/(^|[^0-9])347([^0-9]|$)/.test(v)) return 'F347H'
  return s
}

/** 在"特殊"文本中补"加长阀盖+散热片"（已含 加长/散热 则不重复，幂等）。 */
export function withStructuralHighTemp(特殊: string | undefined): string {
  const s = String(特殊 ?? '')
  if (/加长|散热|extended\s*bonnet/i.test(s)) return s
  const tag = '加长阀盖+散热片'
  return s ? `${s}；${tag}` : tag
}

export interface HighTempItem {
  阀杆轴?: string
  特殊?: string
  备注?: string
}
export interface HighTempResult {
  tempC: number | null
  patch: { 阀杆轴?: string; 特殊?: string }
  changed: string[]
}

/** 综合高温调整：解析温度 → 按阈值给出 阀杆/特殊 的 patch（仅含确有变化的字段）。 */
export function highTempAdjust(item: HighTempItem): HighTempResult {
  const tempC = parseTempC(`${item.特殊 ?? ''} ${item.备注 ?? ''}`)
  const patch: { 阀杆轴?: string; 特殊?: string } = {}
  const changed: string[] = []
  if (tempC == null) return { tempC: null, patch, changed }
  if (tempC >= H_GRADE_C) {
    const up = hGradeStem(item.阀杆轴)
    if (up && up !== String(item.阀杆轴 ?? '')) { patch.阀杆轴 = up; changed.push('阀杆轴') }
  }
  if (tempC >= EXT_BONNET_C) {
    const ns = withStructuralHighTemp(item.特殊)
    if (ns !== String(item.特殊 ?? '')) { patch.特殊 = ns; changed.push('特殊') }
  }
  return { tempC, patch, changed }
}
