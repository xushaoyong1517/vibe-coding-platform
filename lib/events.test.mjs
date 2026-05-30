// node --test lib/events.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valveSpec, diffBomRows } from './events.ts'

test('valveSpec: 类型·主体·件号# 归一化', () => {
  assert.equal(valveSpec({ 类型: '闸阀', 主体: 'WCB', 件号: '8#' }), '闸阀·WCB·8#')
  assert.equal(valveSpec({ 类型: '球阀', 主体: '316/CF8M', 件号: '16' }), '球阀·316/CF8M·16#')
  assert.equal(valveSpec({}), '?·?·?#')
})

test('diffBomRows: 材质/数量改动', () => {
  const before = [
    { 零件: '阀座', 材质: 'A105+13Cr', 数量: 1 },
    { 零件: '阀体', 材质: 'A216 WCB', 数量: 1 },
    { 零件: '螺柱', 材质: 'A193 B7', 数量: 8 },
  ]
  const after = [
    { 零件: '阀座', 材质: 'A105+STL', 数量: 1 },   // 材质改
    { 零件: '阀体', 材质: 'A216 WCB', 数量: 1 },   // 不变
    { 零件: '螺柱', 材质: 'A193 B7', 数量: 12 },    // 数量改
  ]
  const d = diffBomRows(before, after)
  assert.equal(d.length, 2)
  assert.deepEqual(d.find(x => x.零件 === '阀座'), { 零件: '阀座', field: '材质', system_value: 'A105+13Cr', human_value: 'A105+STL' })
  assert.deepEqual(d.find(x => x.零件 === '螺柱'), { 零件: '螺柱', field: '数量', system_value: 8, human_value: 12 })
})

test('diffBomRows: 无改动 → 空', () => {
  const rows = [{ 零件: '阀体', 材质: 'A216 WCB', 数量: 1 }]
  assert.equal(diffBomRows(rows, rows.map(r => ({ ...r }))).length, 0)
})

test('diffBomRows: 新增/删除行', () => {
  const before = [{ 零件: '阀体', 材质: 'WCB', 数量: 1 }, { 零件: '支架', 材质: 'WCB', 数量: 1 }]
  const after = [{ 零件: '阀体', 材质: 'WCB', 数量: 1 }, { 零件: '手轮', 材质: 'KTH350', 数量: 1 }]
  const d = diffBomRows(before, after)
  assert.ok(d.some(x => x.零件 === '手轮' && x.field === '新增'))
  assert.ok(d.some(x => x.零件 === '支架' && x.field === '删除'))
})
