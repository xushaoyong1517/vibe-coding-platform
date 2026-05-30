// node --test lib/fill-template.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillTemplate } from './fill-template.ts'

const TPL = [
  { 零件: '阀体', 材质: '{{主体}}', 数量: 1 },
  { 零件: '阀座', 材质: '{{阀座}}', 数量: 1 },
  { 零件: '阀瓣/闸板', 材质: '{{阀瓣阀闸}}', 数量: 1 },
  { 零件: '阀杆', 材质: '{{阀杆轴}}', 数量: 1 },
  { 零件: '螺柱', 材质: 'A193 B7', 数量: '按DN' },
  { 零件: '螺母', 材质: 'A194 2H', 数量: '按DN' },
  { 零件: '填料', 材质: '柔性石墨', 数量: 5 },
]

test('占位符代入 + 按DN数量(DN100→螺柱8/螺母16)', () => {
  const ph = { 主体: 'A216 WCB', 阀座: 'A105+STL', 阀瓣阀闸: 'WCB+13Cr', 阀杆轴: 'F6a' }
  const { rows, unresolved } = fillTemplate(TPL, ph, 100)
  assert.equal(unresolved.length, 0)
  assert.equal(rows.find((r) => r.零件 === '阀体').材质, 'A216 WCB')
  assert.equal(rows.find((r) => r.零件 === '阀座').材质, 'A105+STL')
  assert.equal(rows.find((r) => r.零件 === '阀瓣/闸板').材质, 'WCB+13Cr')
  assert.equal(rows.find((r) => r.零件 === '阀杆').材质, 'F6a')
  assert.equal(rows.find((r) => r.零件 === '螺柱').数量, 8)
  assert.equal(rows.find((r) => r.零件 === '螺母').数量, 16)
  assert.equal(rows.find((r) => r.零件 === '填料').数量, 5)        // 固定数量保留
  assert.equal(rows.find((r) => r.零件 === '填料').材质, '柔性石墨') // 无占位符原样保留
})

test('DN50 → 螺柱4/螺母8', () => {
  const { rows } = fillTemplate(TPL, { 主体: 'WCB' }, 50)
  assert.equal(rows.find((r) => r.零件 === '螺柱').数量, 4)
  assert.equal(rows.find((r) => r.零件 === '螺母').数量, 8)
})

test('缺失占位符 → 原样保留并记入 unresolved', () => {
  const { rows, unresolved } = fillTemplate(TPL, { 主体: 'WCB' }, 50)
  assert.deepEqual(unresolved, ['阀座', '阀瓣阀闸', '阀杆轴'])
  assert.equal(rows.find((r) => r.零件 === '阀座').材质, '{{阀座}}')
})

test('一行多占位符与混合文本', () => {
  const { rows } = fillTemplate(
    [{ 零件: '阀座', 材质: '{{主体}}+{{密封}}堆焊', 数量: 1 }],
    { 主体: 'A105', 密封: 'STL' }, 50,
  )
  assert.equal(rows[0].材质, 'A105+STL堆焊')
})

test('序号从1递增、来源标注', () => {
  const { rows } = fillTemplate(TPL, { 主体: 'WCB' }, 50)
  assert.equal(rows[0].序号, 1)
  assert.equal(rows[6].序号, 7)
  assert.equal(rows[0].来源, '模板·确定性填充')
})
