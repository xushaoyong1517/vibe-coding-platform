// node --test lib/drawing-codes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDrawingCodes } from './drawing-codes.ts'

test('Z40H 手轮闸阀：无驱动数字 → U4连接/U5结构/U6密封', () => {
  const c = computeDrawingCodes('Z40H-150LB 闸阀手轮', '闸阀', 150, '手轮')
  assert.equal(c.U2, 'Z')
  assert.equal(c.U4, '4')   // 法兰
  assert.equal(c.U5, '0')   // 结构
  assert.equal(c.U6, 'H')   // 密封面 13Cr
  assert.equal(c.U7, '150Lb')
  assert.equal(c.U3, undefined)  // 手轮无驱动码
})

test('Z540H 伞齿轮闸阀：有驱动数字 5 → U3=5', () => {
  const c = computeDrawingCodes('Z540H-150LB 闸阀伞齿轮', '闸阀', 150, '伞齿轮')
  assert.equal(c.U2, 'Z')
  assert.equal(c.U3, '5')   // 伞齿轮
  assert.equal(c.U4, '4')
  assert.equal(c.U5, '0')
  assert.equal(c.U6, 'H')
  assert.equal(c.U7, '150Lb')
})

test('仅元数据(无可解析标题码)也能给 U2/U3/U7', () => {
  const c = computeDrawingCodes('截止阀图纸', '截止阀', 300, '电动')
  assert.equal(c.U2, 'J')
  assert.equal(c.U3, '9')
  assert.equal(c.U7, '300Lb')
})
