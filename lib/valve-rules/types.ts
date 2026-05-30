// 工厂规则库类型定义 —— 牌1(主体材质) / 牌2(API600件号)
// 与导入的 valve_rules_pai1_pai2.json 同构，可直接 JSON.parse 套用。

/** 牌1：一个主体材质族下，14 个零件位的默认材质 */
export interface Pai1Family {
  /** 中文说明，仅注释用 */
  desc?: string
  /** 主体材料代码匹配字母（U8 代码 / 材质牌号），用于反查归属哪个族 */
  applies_to: string[]
  body: string            // 阀体
  bonnet: string          // 阀盖
  seat_base: string       // 阀座(基体)，密封面由牌2叠加
  disc_base: string       // 阀瓣/闸板(基体)，密封面由牌2叠加
  stem: string            // 阀杆(默认值，可被牌2覆盖)
  gasket: string          // 垫片
  stud: string            // 螺柱
  nut: string             // 螺母
  packing: string         // 填料
  packing_sleeve: string  // 填料压套(默认值，可被牌2覆盖)
  packing_plate: string   // 填料压板
  yoke: string            // 支架
  stem_nut: string        // 阀杆螺母
  handwheel: string       // 手轮
}

/** 牌2：一个件号下，7 个可换件密封/内件材质 */
export interface Pai2Trim {
  gate_seal: string       // 闸板/阀瓣密封面
  seat_seal: string       // 阀座密封面
  stem: string            // 阀杆
  backseat: string        // 上密封座
  packing_sleeve: string  // 填料压套
  spacer: string          // 隔圈
  packing_gasket: string  // 填料垫
  alias?: string          // 常用别名
  freq?: 'high' | 'med' | 'low'  // 使用频率
}

/** 一家工厂的完整规则集 */
export interface FactoryRuleset {
  factory_id: string
  pai1: Record<string, Pai1Family>  // family key -> 牌1
  pai2: Record<string, Pai2Trim>    // 件号 -> 牌2
}

/** deriveBOM 输入 */
export interface DeriveInput {
  /** 主体材质：可传 family key（如 'WCB'）或材料代码（如 'C'/'R'/'V3'），自动反查 */
  bodyMaterial: string
  /** 件号（牌2 的 key），如 '8' / '5' / '1' / 'AB' */
  trimNo: string
  /** 口径 DN，用于螺柱/螺母数量 */
  dn: number
}

/** BOM 单行 */
export interface BomLine {
  序号: number
  零件: string
  材质: string
  数量: number
  来源: string
}

/** deriveBOM 输出 */
export interface BomResult {
  bom: BomLine[]
  牌1: string          // 命中的 family key
  牌2: string          // 件号
  warnings: string[]   // 兜底提示（未知件号、需技术部确认等）
}
