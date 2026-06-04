// node --test lib/kitting.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeKitting, summarizeKitting } from './kitting.ts'

const BOM = {
  闸阀A: [
    { 子件编码: '阀体', 用量: 1 },
    { 子件编码: '阀盖', 用量: 1 },
    { 子件编码: '闸板', 用量: 1 },
  ],
}
const INV = { 阀体: 8, 阀盖: 50, 闸板: 12 }

test('多订单按交期统筹扣减：早交期齐套，晚交期缺料', () => {
  const lines = [
    { 订单号: 'B', 行号: 1, 父件编码: '闸阀A', 需求数量: 5, 交期: '2026-06-20' },
    { 订单号: 'A', 行号: 1, 父件编码: '闸阀A', 需求数量: 5, 交期: '2026-06-10' },
  ]
  const { results, remaining } = analyzeKitting(lines, BOM, INV)
  // 排序后 A(早) 先扣：阀体 8→3，齐套
  const A = results.find(r => r.订单号 === 'A')
  const B = results.find(r => r.订单号 === 'B')
  assert.equal(A.状态, '齐套')
  assert.equal(B.状态, '缺料')              // 阀体只剩 3 < 5
  const 阀体B = B.子件.find(c => c.子件编码 === '阀体')
  assert.equal(阀体B.缺口, 2)
  assert.equal(阀体B.可用, 3)
  assert.equal(remaining.阀体, 0)
})

test('无 BOM 的父件标记为 无BOM', () => {
  const lines = [{ 订单号: 'C', 行号: 1, 父件编码: '未知阀', 需求数量: 1, 交期: '2026-06-01' }]
  const { results } = analyzeKitting(lines, BOM, INV)
  assert.equal(results[0].状态, '无BOM')
  assert.deepEqual(results[0].子件, [])
})

test('单层用量倍数：用量>1 正确放大需求', () => {
  const bom = { 法兰组件: [{ 子件编码: '螺柱', 用量: 8 }] }
  const lines = [{ 订单号: 'D', 行号: 1, 父件编码: '法兰组件', 需求数量: 2, 交期: '2026-06-01' }]
  const { results } = analyzeKitting(lines, bom, { 螺柱: 10 })
  const c = results[0].子件[0]
  assert.equal(c.需求, 16)                  // 2 × 8
  assert.equal(c.缺口, 6)                   // 16 - 10
  assert.equal(results[0].状态, '缺料')
})

test('汇总：计数 + 合并缺口清单', () => {
  const lines = [
    { 订单号: 'A', 行号: 1, 父件编码: '闸阀A', 需求数量: 5, 交期: '2026-06-10' },
    { 订单号: 'B', 行号: 1, 父件编码: '闸阀A', 需求数量: 5, 交期: '2026-06-20' },
    { 订单号: 'C', 行号: 1, 父件编码: '未知阀', 需求数量: 1, 交期: '2026-06-01' },
  ]
  const { results } = analyzeKitting(lines, BOM, INV)
  const s = summarizeKitting(results)
  assert.equal(s.齐套, 1)
  assert.equal(s.缺料, 1)
  assert.equal(s.无BOM, 1)
  assert.equal(s.缺口清单[0].子件编码, '阀体')
  assert.equal(s.缺口清单[0].缺口合计, 2)
})
