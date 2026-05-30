// 运行：node --test lib/derive-bom.test.mjs
// 用 Node 内置 test runner，无需额外依赖。导入 .ts 由 Node 类型擦除直接执行。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveBOM, resolveFamily, boltCount, normalizeTrimNo } from './derive-bom.ts'
import { yuechiangRuleset as RS } from './valve-rules/yuechiang.ts'

/** 从 BOM 里按零件名取材质 */
const mat = (bom, name) => bom.find((r) => r.零件 === name)?.材质
const qty = (bom, name) => bom.find((r) => r.零件 === name)?.数量

test('resolveFamily: family key 与材料代码都能命中', () => {
  assert.equal(resolveFamily('WCB', RS.pai1), 'WCB')
  assert.equal(resolveFamily('C', RS.pai1), 'WCB')      // 代码 C → 碳钢
  assert.equal(resolveFamily('R', RS.pai1), 'CF8M')     // 代码 R → 316
  assert.equal(resolveFamily('V3', RS.pai1), 'WC_alloy')
  assert.equal(resolveFamily('未知XX', RS.pai1), null)
})

test('resolveFamily: 前端展示值(U8_BODY_MAP)按 / 分词命中', () => {
  assert.equal(resolveFamily('316/CF8M', RS.pai1), 'CF8M')
  assert.equal(resolveFamily('304/CF8', RS.pai1), 'CF8')
  assert.equal(resolveFamily('304L/CF3', RS.pai1), 'CF8')   // CF3 归 304 族
  assert.equal(resolveFamily('316L/CF3M', RS.pai1), 'CF8M')
  assert.equal(resolveFamily('F11/WC6', RS.pai1), 'WC_alloy')
  assert.equal(resolveFamily('LF2/LCB', RS.pai1), 'LCB')
})

test('normalizeTrimNo: 去 # 与空白', () => {
  assert.equal(normalizeTrimNo('5#'), '5')
  assert.equal(normalizeTrimNo('16#'), '16')
  assert.equal(normalizeTrimNo(' AB '), 'AB')
  assert.equal(normalizeTrimNo('1'), '1')
})

test('deriveBOM: 接受前端原始输入(主体展示值 + 件号带#)', () => {
  const { bom, 牌1, 牌2 } = deriveBOM({ bodyMaterial: '316/CF8M', trimNo: '16#', dn: 80 }, RS)
  assert.equal(牌1, 'CF8M')
  assert.equal(牌2, '16')
  assert.equal(bom.find((r) => r.零件 === '阀杆')?.材质, '316')
})

test('boltCount: DN 分档', () => {
  assert.deepEqual(boltCount(40), { stud: 4, nut: 8 })
  assert.deepEqual(boltCount(50), { stud: 4, nut: 8 })
  assert.deepEqual(boltCount(100), { stud: 8, nut: 16 })
  assert.deepEqual(boltCount(200), { stud: 8, nut: 16 })
  assert.deepEqual(boltCount(300), { stud: 12, nut: 24 })
  assert.deepEqual(boltCount(400), { stud: 16, nut: 32 })
})

test('WCB + 5# (全堆焊) —— 对照《合成示例》逐项校验', () => {
  const { bom, warnings } = deriveBOM({ bodyMaterial: 'WCB', trimNo: '5', dn: 50 }, RS)
  assert.equal(mat(bom, '阀体'), 'A216 WCB')
  assert.equal(mat(bom, '阀盖'), 'A216 WCB')
  assert.equal(mat(bom, '阀座'), 'A105 + HF(STL)')       // 基体A105 + STL座
  assert.equal(mat(bom, '阀瓣/闸板'), 'A216 WCB + HF(STL)')
  assert.equal(mat(bom, '阀杆'), 'Cr13')
  assert.equal(mat(bom, '上密封座'), 'Cr13')
  assert.equal(mat(bom, '填料压套'), 'Cr13')
  assert.equal(mat(bom, '螺柱'), 'A193 B7')
  assert.equal(mat(bom, '螺母'), 'A194 2H')
  assert.equal(mat(bom, '垫片'), '304+柔性石墨')
  assert.equal(mat(bom, '填料'), '柔性石墨+缠绕填料')
  assert.equal(mat(bom, '填料压板'), 'A216 WCB')
  assert.equal(mat(bom, '支架'), 'A216 WCB')
  assert.equal(mat(bom, '阀杆螺母'), 'ZQAL9-4')
  assert.equal(mat(bom, '手轮'), 'KTH350-10')
  assert.equal(warnings.length, 0)
  // DN50 → 螺柱4/螺母8；填料固定5
  assert.equal(qty(bom, '螺柱'), 4)
  assert.equal(qty(bom, '螺母'), 8)
  assert.equal(qty(bom, '填料'), 5)
})

test('WCB + 8# (半堆焊：13Cr瓣+STL座) DN100', () => {
  const { bom, 牌1, warnings } = deriveBOM({ bodyMaterial: 'C', trimNo: '8', dn: 100 }, RS)
  assert.equal(牌1, 'WCB')
  assert.equal(mat(bom, '阀座'), 'A105 + HF(STL)')        // 8# 阀座=STL
  assert.equal(mat(bom, '阀瓣/闸板'), 'A216 WCB + Cr13')  // 8# 闸板=Cr13
  assert.equal(mat(bom, '阀杆'), 'Cr13')
  assert.equal(qty(bom, '螺柱'), 8)                        // DN100
  assert.equal(qty(bom, '螺母'), 16)
  assert.equal(warnings.length, 0)
})

test('WCB + 1# (平装 全13Cr) DN50', () => {
  const { bom } = deriveBOM({ bodyMaterial: 'WCB', trimNo: '1', dn: 50 }, RS)
  assert.equal(mat(bom, '阀座'), 'A105 + Cr13')
  assert.equal(mat(bom, '阀瓣/闸板'), 'A216 WCB + Cr13')
  assert.equal(mat(bom, '阀杆'), 'Cr13')
})

test('316 体 + 16# (STL密封+316内件)', () => {
  const { bom, 牌1 } = deriveBOM({ bodyMaterial: 'R', trimNo: '16', dn: 80 }, RS)
  assert.equal(牌1, 'CF8M')
  assert.equal(mat(bom, '阀体'), 'A351 CF8M/CF3M/CF8C')
  assert.equal(mat(bom, '阀座'), 'A182 F316/F316L + HF(STL)')
  assert.equal(mat(bom, '阀瓣/闸板'), 'A351 CF8M/CF3M/CF8C + HF(STL)')
  assert.equal(mat(bom, '阀杆'), '316')
  assert.equal(mat(bom, '垫片'), '316+柔性石墨')
})

test('兜底：未知件号', () => {
  const { bom, warnings } = deriveBOM({ bodyMaterial: 'WCB', trimNo: '99', dn: 50 }, RS)
  assert.equal(bom.length, 0)
  assert.match(warnings[0], /未知件号/)
})

test('兜底：非常用件号给出「需技术部确认」提示', () => {
  const { warnings } = deriveBOM({ bodyMaterial: 'WCB', trimNo: '7', dn: 50 }, RS)
  assert.match(warnings[0], /需技术部确认/)
})
