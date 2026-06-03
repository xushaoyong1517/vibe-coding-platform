import { VALVE_CODE_TABLES } from '../valve-code-tables'

// GLOBAL 阀门参数库种子：词典取自 valve-code-tables，别名按现有 prompt + 常识补一版。
// 核心6 = U2(类型) U5(结构) U6(密封面/内件) U7(压力) U8(阀体) U9(口径)。

const CORE6 = new Set(['U2', 'U5', 'U6', 'U7', 'U8', 'U9'])

// 手工别名：unit → code → aliases（小写匹配；归一化时统一 lowercase 比对）
const ALIASES: Record<string, Record<string, string[]>> = {
  U2: {
    Z: ['闸阀', 'gate', 'gate valve'],
    J: ['截止阀', 'globe', 'globe valve'],
    H: ['止回阀', '底阀', '逆止阀', 'check', 'check valve', 'swing'],
    Q: ['球阀', 'ball'],
    D: ['蝶阀', 'butterfly'],
    L: ['节流阀', 'throttle'],
    A: ['安全阀', '泄压阀', 'psv', 'relief'],
    X: ['旋塞阀', 'plug'],
    G: ['隔膜阀', 'diaphragm'],
    U: ['柱塞阀', 'piston', 'plunger'],
    N: ['针形阀', 'needle'],
  },
  U7: {
    '150Lb': ['150', '150磅', '150lb', 'cl150', 'class150', 'pn16', 'pn20'],
    '300Lb': ['300', '300磅', '300lb', 'cl300', 'class300', 'pn25', 'pn40', 'pn50'],
    '600Lb': ['600', '600磅', '600lb', 'cl600', 'pn63', 'pn100'],
    '800Lb': ['800', '800磅', '800lb', 'cl800'],
    '900Lb': ['900', '900磅', '900lb', 'cl900', 'pn150', 'pn160'],
    '1500Lb': ['1500', '1500磅', '1500lb', 'cl1500', 'pn250'],
    '2500Lb': ['2500', '2500磅', '2500lb', 'cl2500', 'pn420'],
  },
  U8: {
    C: ['碳钢', '碳素钢', 'cs', 'wcb', 'a105', 'a216-wcb', 'a216 wcb'],
    C2: ['低温钢', '低温碳钢', 'lcb', 'lcc', 'lf2', 'a352'],
    V3: ['铬钼钢', 'wc6', 'f11', '1.25cr', 'a217-wc6', 'a182-f11'],
    V4: ['wc9', 'f22', '2.25cr', 'a217-wc9'],
    P: ['304', 'cf8', 'f304', 'a351-cf8', '304不锈钢'],
    P2: ['321', 'cf8c', 'f321', '含铌不锈钢'],
    L: ['316l', 'cf3m', 'f316l'],
    L1: ['304l', 'cf3', 'f304l'],
    R: ['316', 'cf8m', 'f316', 'a351-cf8m', '316不锈钢'],
    A20: ['alloy20', 'alloy 20', 'n08020', '20号合金'],
    M400: ['monel', '蒙乃尔', 'monel400', 'n04400'],
  },
  U6: { // 密封面 ≈ 内件/件号代号（'Y' 为产品库主力码：硬面堆焊）
    Y: ['stl', 'stlt', 'hf', '硬面', '堆焊', 'stl堆焊', '硬质合金', 'stellite', '司太立', '哈斯特'],
    Y1: ['单堆焊', '单层堆焊', '硬质合金单堆焊'],
    Y2: ['双堆焊', '全堆焊', '双层堆焊'],
    W: ['本体', '整体', '同本体'],
    H: ['铁基', '铁基不锈钢', '13cr', 'cr13', '410'],
    M: ['蒙乃尔密封', 'monel'],
    F: ['ptfe', '聚四氟', '四氟'],
    X: ['橡胶', 'nbr', 'epdm', 'viton'],
  },
  U5: { // 结构形式（闸阀常用）
    '0': ['弹性楔', '弹性闸板', '弹性单闸板', 'flexible wedge'],
    '1': ['实心楔', '刚性闸板', '实心单闸板', 'solid wedge'],
    '3': ['平板', '平行单闸板', '平板闸阀', 'slab'],
  },
  U4: {
    '4': ['法兰', '法兰式', 'flanged'],
    '6': ['焊接', '对焊', 'bw', '焊接式'],
    '1': ['内螺纹', '螺纹', 'thd', 'ft'],
  },
  U10: {
    R: ['rf', '突面'],
    J: ['rj', 'rtj', '环连接', '环连接面'],
    B: ['bw', '对焊'],
    S: ['sw', '承插焊'],
  },
}

// 产品库里存在、但 valve-code-tables 字典缺失的码 —— 补齐（对齐历史数据）
const EXTRA_ENTRIES: Record<string, { code: string; cn: string; en?: string; aliases: string[] }[]> = {
  // U6='Y'：产品库主力(187条)，硬面堆焊；字典原只有 Y1/Y2
  U6: [{ code: 'Y', cn: '硬面堆焊(STL)', en: 'Hardfacing (Stellite)', aliases: ['stl', 'stlt', 'hf', '硬面', '堆焊', 'stl堆焊', '硬质合金', 'stellite', '司太立'] }],
}

// U9 口径：从 cn(DN100) / en(NPS 4") 自动派生别名
function deriveDnAliases(cn: string, en: string): string[] {
  const a: string[] = []
  const dn = cn.replace(/^DN/, '')
  if (dn) a.push(dn)
  const inch = en.match(/NPS\s*([\d./-]+)"/)?.[1]
  if (inch) a.push(`${inch}"`, `${inch}寸`, `${inch}inch`, `${inch}in`)
  return a
}

export interface ParamUnitSeed {
  unit: string; name_cn: string; name_en: string; tier: string; is_core6: boolean
  entries: { code: string; cn: string; en?: string; note?: string; aliases: string[] }[]
}

export function buildGlobalParamUnits(): ParamUnitSeed[] {
  return VALVE_CODE_TABLES.map(t => ({
    unit: t.unit,
    name_cn: t.name_cn,
    name_en: t.name_en,
    tier: t.tier,
    is_core6: CORE6.has(t.unit),
    entries: [
      ...t.entries.map(e => {
        const manual = ALIASES[t.unit]?.[e.code] ?? []
        const auto = t.unit === 'U9' ? deriveDnAliases(e.cn, e.en) : []
        const aliases = [...new Set([...manual, ...auto])]
        return { code: e.code, cn: e.cn, en: e.en, ...(e.note ? { note: e.note } : {}), aliases }
      }),
      ...(EXTRA_ENTRIES[t.unit] ?? []),  // 补齐产品库存在但字典缺失的码
    ],
  }))
}
