// node --test lib/derive-u6.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveU6 } from './normalize-params.ts'

test('deriveU6: 材质串优先', () => {
  assert.equal(deriveU6({ 阀座: 'A105+STL', 阀瓣阀闸: 'WCB+13Cr' }), 'Y')   // STL→Y(主力)
  assert.equal(deriveU6({ 阀座: '本体+13Cr', 阀瓣阀闸: 'WCB+13Cr' }), 'H')   // 13Cr→H
  assert.equal(deriveU6({ 阀座: '本体', 阀瓣阀闸: 'CF8(本体)' }), 'W')        // 本体→W
  assert.equal(deriveU6({ 阀座: 'Monel', 阀瓣阀闸: 'Monel' }), 'M')
})

test('deriveU6: 件号兜底', () => {
  assert.equal(deriveU6({ 件号: '8#' }), 'Y')    // 13Cr瓣+STL座（座为STL→Y）
  assert.equal(deriveU6({ 件号: '5#' }), 'Y')    // 全堆焊
  assert.equal(deriveU6({ 件号: '1#' }), 'H')    // 平装13Cr
  assert.equal(deriveU6({ 件号: '2#' }), 'W')    // 本体
})

test('deriveU6: 无依据 → null', () => {
  assert.equal(deriveU6({ 主体: 'WCB' }), null)
})
