import type { FactoryRuleset, BomResult, BomLine, DeriveInput } from './valve-rules/types'

// 确定性 BOM 材质合成 —— 把「牌1 + 牌2 查表 + 拼接」从 LLM 挪到纯函数。
// 合成规则来源：越强《合成示例》(WCB + 件号5# → 完整BOM材质)。
//   阀座   = 牌1.seat_base「基体」+ 牌2.seat_seal「密封面」     例 A105 + HF(STL)
//   阀瓣   = 牌1.disc_base「基体」+ 牌2.gate_seal「密封面」     例 A216 WCB + HF(STL)
//   阀杆   = 牌2.stem 覆盖 牌1.stem 默认
//   上密封座/填料压套 = 牌2 对应列（覆盖牌1默认）
//   其余结构件(阀体/阀盖/螺柱/螺母/垫片/填料/填料压板/支架/阀杆螺母/手轮) = 牌1 直接取

/** 件号超出常用范围 → 输出基础BOM但标注「需技术部确认」 */
const NEEDS_REVIEW = new Set(['3', '4', '6', '7', '11', '14', '17', '18'])

/** 取「基体」：材质串中第一个 '+' 之前的部分（如 'A105+13Cr/STL' → 'A105'） */
function substrate(material: string): string {
  return material.split('+')[0].trim()
}

/** 件号归一化：去掉 '#'/空白，'5#' → '5'，'AB ' → 'AB' */
export function normalizeTrimNo(trimNo: string): string {
  return String(trimNo).replace(/#/g, '').trim()
}

/**
 * 把主体材质解析为牌1的 family key。
 * 接受三种输入：family key（'WCB'）、材料代码（'C'/'R'/'V3'）、
 * 以及前端展示值（U8_BODY_MAP 的形式，如 '316/CF8M'、'F11/WC6'）——按 '/' 分词逐个匹配。
 */
export function resolveFamily(bodyMaterial: string, pai1: FactoryRuleset['pai1']): string | null {
  if (pai1[bodyMaterial]) return bodyMaterial            // 直接是 family key
  // 拆出候选 token：整串 + 按 '/' 分隔的各段
  const raw = bodyMaterial.trim()
  const tokens = [raw, ...raw.split('/')].map((s) => s.trim().toUpperCase()).filter(Boolean)
  for (const [key, fam] of Object.entries(pai1)) {
    const codes = fam.applies_to.map((c) => c.toUpperCase())
    if (tokens.some((tk) => codes.includes(tk))) return key
  }
  return null
}

/** 单台阀门的螺柱/螺母数量（按 DN 查表） */
export function boltCount(dn: number): { stud: number; nut: number } {
  let stud: number
  if (dn <= 65) stud = 4
  else if (dn <= 200) stud = 8
  else if (dn <= 300) stud = 12
  else stud = 16
  return { stud, nut: stud * 2 }
}

/** 主合成函数：纯函数，无副作用、无网络、可单测 */
export function deriveBOM(input: DeriveInput, ruleset: FactoryRuleset): BomResult {
  const { bodyMaterial, dn } = input
  const trimNo = normalizeTrimNo(input.trimNo)
  const warnings: string[] = []

  const familyKey = resolveFamily(bodyMaterial, ruleset.pai1)
  if (!familyKey) {
    return { bom: [], 牌1: '', 牌2: trimNo, warnings: [`未知主体材质「${bodyMaterial}」，无法匹配牌1`] }
  }
  const p1 = ruleset.pai1[familyKey]

  const p2 = ruleset.pai2[trimNo]
  if (!p2) {
    return { bom: [], 牌1: familyKey, 牌2: trimNo, warnings: [`未知件号「${trimNo}」，不在牌2规则表中`] }
  }
  if (NEEDS_REVIEW.has(trimNo)) {
    warnings.push(`件号 ${trimNo}# 超出常用范围，已输出基础BOM，需技术部确认`)
  }

  const { stud, nut } = boltCount(dn)
  const seat = `${substrate(p1.seat_base)} + ${p2.seat_seal}`     // 阀座 = 基体 + 阀座密封面
  const disc = `${substrate(p1.disc_base)} + ${p2.gate_seal}`     // 阀瓣 = 基体 + 闸板密封面

  const rows: Omit<BomLine, '序号'>[] = [
    { 零件: '阀体',      材质: p1.body,           数量: 1,    来源: `牌1·${familyKey}` },
    { 零件: '阀盖',      材质: p1.bonnet,         数量: 1,    来源: `牌1·${familyKey}` },
    { 零件: '阀座',      材质: seat,              数量: 1,    来源: `牌1基体+牌2·${trimNo}#密封面` },
    { 零件: '阀瓣/闸板', 材质: disc,              数量: 1,    来源: `牌1基体+牌2·${trimNo}#密封面` },
    { 零件: '阀杆',      材质: p2.stem,           数量: 1,    来源: `牌2·${trimNo}#` },
    { 零件: '上密封座',  材质: p2.backseat,       数量: 1,    来源: `牌2·${trimNo}#` },
    { 零件: '填料压套',  材质: p2.packing_sleeve, 数量: 1,    来源: `牌2·${trimNo}#` },
    { 零件: '螺柱',      材质: p1.stud,           数量: stud, 来源: `牌1·DN${dn}查表` },
    { 零件: '螺母',      材质: p1.nut,            数量: nut,  来源: `牌1·2×螺柱` },
    { 零件: '垫片',      材质: p1.gasket,         数量: 1,    来源: `牌1·${familyKey}` },
    { 零件: '填料',      材质: p1.packing,        数量: 5,    来源: '牌1·上下2+中间3' },
    { 零件: '填料压板',  材质: p1.packing_plate,  数量: 1,    来源: `牌1·${familyKey}` },
    { 零件: '支架',      材质: p1.yoke,           数量: 1,    来源: `牌1·${familyKey}` },
    { 零件: '阀杆螺母',  材质: p1.stem_nut,       数量: 1,    来源: '牌1·通用' },
    { 零件: '手轮',      材质: p1.handwheel,      数量: 1,    来源: '牌1·通用' },
  ]

  const bom: BomLine[] = rows.map((r, i) => ({ 序号: i + 1, ...r }))
  return { bom, 牌1: familyKey, 牌2: trimNo, warnings }
}
