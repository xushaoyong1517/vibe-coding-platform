// node --test lib/build-bom.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBomFromSkeleton, skeletonFromBom } from './build-bom.ts'
import { yuechiangRuleset as RS } from './valve-rules/yuechiang.ts'

const mat = (bom, name) => bom.find(r => r.零件 === name)?.材质
const qty = (bom, name) => bom.find(r => r.零件 === name)?.数量

// Z40H-150LB 手轮闸阀小样图骨架（19件，材质是图上参考 13Cr 配置）
const Z40H = [
  { 零件: '阀体', 材质: 'WCB' }, { 零件: '阀座', 材质: 'A105+13Cr' }, { 零件: '阀板', 材质: 'WCB+13Cr' },
  { 零件: '阀杆', 材质: '20Cr13' }, { 零件: '垫片', 材质: '304+柔性石墨' }, { 零件: '阀盖', 材质: 'WCB' },
  { 零件: '螺母', 材质: '2H' }, { 零件: '螺栓', 材质: 'B7' }, { 零件: '上密封座', 材质: '12Cr13' },
  { 零件: '填料', 材质: '304+柔性石墨' }, { 零件: '销轴', 材质: '45' }, { 零件: '活接螺栓', 材质: 'B7' },
  { 零件: '支架', 材质: 'WCB' }, { 零件: '填料压套', 材质: '12Cr13' }, { 零件: '填料压板', 材质: 'WCB' },
  { 零件: '轴承' }, { 零件: '阀杆螺母', 材质: 'ZQAL9-4' }, { 零件: '手轮', 材质: 'KHT350' },
]

test('骨架 × 规则填充：同一骨架按 8# 重填材质（非照抄图上 13Cr）', () => {
  const r = buildBomFromSkeleton(Z40H, { bodyMaterial: 'WCB', trimNo: '8#', dn: 100 }, RS, '小样图')
  assert.equal(r.skeletonSource, '小样图')
  assert.equal(r.bom.length, 18)
  // 材质按 8# 规则重填（阀座=STL座，阀板=Cr13），不是图上的 A105+13Cr
  assert.equal(mat(r.bom, '阀座'), 'A105 + HF(STL)')
  assert.equal(mat(r.bom, '阀板'), 'A216 WCB + Cr13')   // 阀板→阀瓣/闸板 别名命中
  assert.equal(mat(r.bom, '阀体'), 'A216 WCB')
  assert.equal(mat(r.bom, '手轮'), 'KTH350-10')          // 规则材质覆盖图上 KHT350
  // 非标准件保留图上/默认材质
  assert.equal(mat(r.bom, '销轴'), '45')
  assert.equal(mat(r.bom, '活接螺栓'), 'A193 B7')         // 活接螺栓→螺柱 别名→规则材质
  assert.equal(mat(r.bom, '轴承'), '')                    // EXTRA_DEFAULT 空
})

test('数量：螺栓/活接螺栓按DN，填料=5，其余=1', () => {
  const r = buildBomFromSkeleton(Z40H, { bodyMaterial: 'WCB', trimNo: '8#', dn: 100 }, RS)
  assert.equal(qty(r.bom, '螺栓'), 8)        // DN100
  assert.equal(qty(r.bom, '活接螺栓'), 8)
  assert.equal(qty(r.bom, '螺母'), 16)
  assert.equal(qty(r.bom, '填料'), 5)
  assert.equal(qty(r.bom, '阀体'), 1)
})

test('空骨架 → 退回标准 15 行(deriveBOM)', () => {
  const r = buildBomFromSkeleton(null, { bodyMaterial: 'WCB', trimNo: '8#', dn: 100 }, RS)
  assert.equal(r.skeletonSource, 'standard')
  assert.equal(r.bom.length, 15)
})

test('skeletonFromBom：从历史BOM行抽骨架(只留零件名)', () => {
  const hist = [{ 零件: '阀体', 材质: 'A216 WCB' }, { 零件: '伞齿轮', 材质: '' }]
  const sk = skeletonFromBom(hist)
  assert.deepEqual(sk, [{ 零件: '阀体' }, { 零件: '伞齿轮' }])
  // 用历史骨架(含伞齿轮)重填
  const r = buildBomFromSkeleton(sk, { bodyMaterial: 'CF8M', trimNo: '16#', dn: 80 }, RS, '历史')
  assert.equal(mat(r.bom, '阀体'), 'A351 CF8M/CF3M/CF8C')  // 316体材质
  assert.equal(mat(r.bom, '伞齿轮'), '')                    // 非标准件
})
