// 从小样图标题码 + 元数据 算归一 codes（与明细行/历史行同一套键）。纯函数可测。

const TYPE_TO_U2: Record<string, string> = { 闸阀: 'Z', 截止阀: 'J', 止回阀: 'H', 球阀: 'Q', 蝶阀: 'D', 旋塞阀: 'X' }
const ACT_TO_U3: Record<string, string> = { 手轮: '', 伞齿轮: '5', 电动: '9', 气动: '6', 蜗轮: '3', 正齿轮: '4' }

/**
 * 标题码格式：[类型字母][可选驱动数字][连接数字][结构数字][密封面字母]-[压力]
 *   Z40H-150LB  → Z(U2) 4(U4连接) 0(U5结构) H(U6密封)  · 手轮(无驱动数字)
 *   Z540H-150LB → Z(U2) 5(U3伞齿轮) 4(U4) 0(U5) H(U6)
 */
export function computeDrawingCodes(
  name: string, valve_type?: string, pressure?: number, actuator?: string,
): Record<string, string> {
  const codes: Record<string, string> = {}
  if (valve_type && TYPE_TO_U2[valve_type]) codes.U2 = TYPE_TO_U2[valve_type]
  if (actuator && actuator in ACT_TO_U3 && ACT_TO_U3[actuator]) codes.U3 = ACT_TO_U3[actuator]
  if (pressure) codes.U7 = `${pressure}Lb`

  // 标题码补 U2/U4/U5/U6（标题码更权威）
  const token = String(name ?? '').match(/\b([A-Za-z]\d{2,3}[A-Za-z]\d?)\b/)?.[1]
  if (token) {
    const m = token.match(/^([A-Za-z])(\d{2,3})([A-Za-z]\d?)$/)
    if (m) {
      const [, t, digits, seal] = m
      if (!codes.U2) codes.U2 = t.toUpperCase()
      if (digits.length === 3) { codes.U3 = digits[0]; codes.U4 = digits[1]; codes.U5 = digits[2] }
      else { codes.U4 = digits[0]; codes.U5 = digits[1] }
      codes.U6 = seal.toUpperCase()
    }
  }
  return codes
}
