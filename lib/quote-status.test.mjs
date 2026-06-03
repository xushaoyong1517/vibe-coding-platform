// node --test lib/quote-status.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextStates, canTransition, isTerminal, transitionBlockReason, STATUS_META,
} from './quote-status.ts'

test('合法流转：草稿→已发送，已确认→已下单', () => {
  assert.ok(canTransition('草稿', '已发送'))
  assert.ok(canTransition('已确认', '已下单'))
  assert.ok(canTransition('已发送', '草稿'))   // 可退回改单
})

test('非法流转被拒：草稿不能直接已下单；终态不可再走', () => {
  assert.ok(!canTransition('草稿', '已下单'))
  assert.ok(!canTransition('已下单', '已失单'))
  assert.deepEqual(nextStates('已下单'), [])
  assert.deepEqual(nextStates('已失单'), [])
})

test('终态判定 + 成交真值', () => {
  assert.ok(isTerminal('已下单'))
  assert.ok(isTerminal('作废'))
  assert.ok(!isTerminal('草稿'))
  assert.equal(STATUS_META['已下单'].truth, 'won')
  assert.equal(STATUS_META['已失单'].truth, 'lost')
})

test('守卫：未生成 BOM 不能发送', () => {
  assert.match(transitionBlockReason('已发送', { hasBom: false }) ?? '', /BOM/)
  assert.equal(transitionBlockReason('已发送', { hasBom: true }), null)
  assert.equal(transitionBlockReason('已确认', { hasBom: false }), null)
})

test('未知状态兜底到草稿', () => {
  assert.deepEqual(nextStates('报价中'), ['草稿'])
})
