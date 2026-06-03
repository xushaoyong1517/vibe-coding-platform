import { deriveBOM, boltCount } from './derive-bom.ts'
import type { FactoryRuleset, BomLine, DeriveInput, BomResult } from './valve-rules/types'

// BOM 骨架引擎：骨架给"哪些零件/顺序/自定义件"，牌1/牌2 给当前材质，按DN给数量。
// 关键：骨架自带的材质只是参考，材质一律按规则重填（同一骨架不同件号→材质不同）。

export interface SkeletonPart { 零件: string; 材质?: string; 数量?: number | string; 来源?: string }

// 骨架零件名 → deriveBOM 标准件名（别名归一）
const PART_ALIAS: Record<string, string> = {
  阀板: '阀瓣/闸板', 闸板: '阀瓣/闸板', 阀瓣: '阀瓣/闸板', 阀芯: '阀瓣/闸板', 球体: '阀瓣/闸板',
  螺栓: '螺柱', 双头螺柱: '螺柱', 活接螺栓: '螺柱', 螺柱: '螺柱',
  螺帽: '螺母', 支承: '支架',
}
// 小样图常见、但 deriveBOM 标准件没有的零件 → 默认材质
const EXTRA_DEFAULT: Record<string, string> = {
  销轴: '45', 轴承: '', 伞齿轮: '', 蜗轮: '', 电动装置: '', 气动装置: '',
}

function qtyFor(零件: string, stud: number, nut: number, given?: number): number {
  if (typeof given === 'number' && given > 0) return given
  if (零件 === '填料') return 5
  if (/螺母|螺帽/.test(零件)) return nut
  if (/螺栓|螺柱/.test(零件)) return stud
  return 1
}

export interface BuildResult extends BomResult { skeletonSource: string }

/**
 * 按骨架生成 BOM。骨架为空 → 退回 deriveBOM 标准15行。
 * @param sourceLabel 骨架来源标签（'历史'/'小样图'/'标准'），用于行来源标注
 */
export function buildBomFromSkeleton(
  skeleton: SkeletonPart[] | null | undefined,
  input: DeriveInput,
  ruleset: FactoryRuleset,
  sourceLabel = '骨架',
): BuildResult {
  const derived = deriveBOM(input, ruleset)
  if (!skeleton || skeleton.length === 0) return { ...derived, skeletonSource: 'standard' }

  const matOf = new Map<string, BomLine>()
  derived.bom.forEach(r => matOf.set(r.零件, r))
  const { stud, nut } = boltCount(input.dn)

  const bom: BomLine[] = skeleton.map((p, i) => {
    const std = PART_ALIAS[p.零件] ?? p.零件
    const hit = matOf.get(std)
    const 材质 = hit?.材质
      ?? (p.零件 in EXTRA_DEFAULT ? EXTRA_DEFAULT[p.零件] : (p.材质 ?? '需技术部确认'))
    const 数量 = qtyFor(p.零件, stud, nut, typeof p.数量 === 'number' ? p.数量 : undefined)
    const 来源 = hit?.来源 ?? (p.零件 in EXTRA_DEFAULT ? `${sourceLabel}·标准件` : `${sourceLabel}·参考`)
    return { 序号: i + 1, 零件: p.零件, 材质, 数量, 来源 }
  })
  return { bom, 牌1: derived.牌1, 牌2: derived.牌2, warnings: derived.warnings, skeletonSource: sourceLabel }
}

/** 从历史 BOM 行抽骨架（仅零件名 + 顺序，丢弃旧材质） */
export function skeletonFromBom(rows: { 零件: string }[]): SkeletonPart[] {
  return rows.map(r => ({ 零件: r.零件 }))
}
