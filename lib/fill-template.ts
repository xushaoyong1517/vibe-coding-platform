import type { BomLine } from './valve-rules/types'
import { boltCount } from './derive-bom.ts'

// 确定性模板填充 —— 替代「模式A：模板模式」原来由 LLM 做的占位符代入。
//   材质里的 {{字段}} → placeholders[字段]（客户参数值，缺失回退推导值）
//   数量为非数字（如 "按DN"）→ 按零件名查螺柱/螺母数量
// 纯函数，无副作用、可单测。

export interface TemplateRow {
  零件: string
  材质: string
  数量: number | string
}

/** 把模板骨架按占位符字典填充为完整 BOM 行 */
export function fillTemplate(
  template: TemplateRow[],
  placeholders: Record<string, string | number | undefined>,
  dn: number,
): { rows: BomLine[]; unresolved: string[] } {
  const { stud, nut } = boltCount(dn)
  const unresolved: string[] = []

  const rows = template.map((row, i): BomLine => {
    const 材质 = String(row.材质 ?? '').replace(/\{\{([^}]+)\}\}/g, (_m, key) => {
      const k = String(key).trim()
      const v = placeholders[k]
      if (v === undefined || v === '') { unresolved.push(k); return `{{${k}}}` }
      return String(v)
    })

    let 数量: number
    if (typeof row.数量 === 'number') {
      数量 = row.数量
    } else {
      const name = String(row.零件)
      数量 = /螺母|螺帽/.test(name) ? nut : /螺柱|螺栓/.test(name) ? stud : 1
    }

    return { 序号: i + 1, 零件: row.零件, 材质, 数量, 来源: '模板·确定性填充' }
  })

  return { rows, unresolved: [...new Set(unresolved)] }
}
