// node --test lib/match-drawing.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchDrawing, scoreDrawing } from './match-drawing.ts'

// 两张同为闸阀(Z)、同压力/驱动，仅结构U5不同的小样图
const D_WEDGE = { id: 'd1', name: '楔式', valve_type: '闸阀', pressure: 150, actuator: '手轮', dn_min: 50, dn_max: 600, codes: { U2: 'Z', U4: '4', U5: '0', U6: 'H' } }
const D_PARALLEL = { id: 'd2', name: '平行', valve_type: '闸阀', pressure: 150, actuator: '手轮', dn_min: 50, dn_max: 600, codes: { U2: 'Z', U4: '4', U5: '5', U6: 'H' } }
const D_GLOBE = { id: 'd3', name: '截止', valve_type: '截止阀', pressure: 150, actuator: '手轮', dn_min: 50, dn_max: 600, codes: { U2: 'J', U4: '4', U5: '1', U6: 'H' } }

test('归一码：结构U5 区分两张同型同压小样图', () => {
  const item = { 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮' }
  const m = matchDrawing(item, [D_WEDGE, D_PARALLEL], { U2: 'Z', U4: '4', U5: '5', U6: 'H' })
  assert.equal(m.id, 'd2')   // 命中平行(U5=5)，而非楔式
})

test('归一码：类型U2 不同直接淘汰', () => {
  const item = { 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮' }
  assert.equal(scoreDrawing(item, { U2: 'Z' }, D_GLOBE), -1)
  const m = matchDrawing(item, [D_GLOBE], { U2: 'Z', U5: '0' })
  assert.equal(m, null)      // 池中只有截止阀，归一码淘汰 → 中文兜底也不匹配
})

test('DN 超范围被排除', () => {
  const narrow = { ...D_WEDGE, dn_min: 50, dn_max: 80 }
  const item = { 类型: '闸阀', DN: 200, 压力: 150, 驱动: '手轮' }
  assert.equal(matchDrawing(item, [narrow], { U2: 'Z', U5: '0' }), null)
})

test('无 codes 时回落中文字段兜底', () => {
  const item = { 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮' }
  const m = matchDrawing(item, [D_WEDGE, D_GLOBE])   // 不传 codes，两图也无需 codes 路径
  assert.equal(m.id, 'd1')   // 阀型+压力+驱动 命中楔式
})

test('codes 优先于 item.codes 参数覆盖', () => {
  const item = { 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮', codes: { U2: 'Z', U5: '0' } }
  const m = matchDrawing(item, [D_WEDGE, D_PARALLEL])  // 用 item.codes → U5=0 → 楔式
  assert.equal(m.id, 'd1')
})
