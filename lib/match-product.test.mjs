// node --test lib/match-product.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchProduct } from './match-product.ts'

// 产品 fixture（19码子集 + 下单次数）
const P = [
  { U2: 'Z', U5: '1', U6: 'Y', U7: '150Lb', U8: 'C', U9: 100, 下单次数: 25, full_code: 'Z41Y-150LBWCB-DN100' },
  { U2: 'Z', U5: '1', U6: 'Y', U7: '150Lb', U8: 'C', U9: 100, 下单次数: 10, full_code: 'Z41Y-150LBWCB-DN100b' },
  { U2: 'Z', U5: '0', U6: 'H', U7: '150Lb', U8: 'C', U9: 100, 下单次数: 4,  full_code: 'Z40H-150LBWCB-DN100' },
  { U2: 'Z', U5: '1', U6: 'Y', U7: '300Lb', U8: 'C', U9: 50,  下单次数: 15, full_code: 'Z41Y-300LBWCB-DN50' },
  { U2: 'J', U5: '1', U6: 'Y', U7: '150Lb', U8: 'C', U9: 50,  下单次数: 8,  full_code: 'J41Y-150LBWCB-DN50' },
]

test('similar：核心4命中(类型/压力/阀体/口径)，U5/U6 由历史补缺', () => {
  const r = matchProduct({ U2: 'Z', U7: '150Lb', U8: 'C', U9: '100' }, P)
  assert.equal(r.level, 'similar')
  assert.equal(r.rows, 3)                       // 三行命中 DN100/150/Z/C
  assert.equal(r.count, 25 + 10 + 4)            // 下单次数之和
  assert.equal(r.prefill.U5, '1')              // 最高频结构=1（25+10 > 4）
  assert.equal(r.prefill.U6, 'Y')              // 最高频密封面=Y
  assert.ok(r.filledFields.includes('U5') && r.filledFields.includes('U6'))
})

test('核心5收窄：给了 U6 → 用上它过滤（比仅核心4更准）', () => {
  // 给 U6=Y 只命中 U6=Y 的行（排除 U5=0/U6=H 的那行）
  const r = matchProduct({ U2: 'Z', U7: '150Lb', U8: 'C', U9: '100', U6: 'Y' }, P)
  assert.equal(r.level, 'similar')
  assert.equal(r.rows, 2)                       // 仅 U6=Y 两行
  assert.equal(r.count, 25 + 10)
  assert.equal(r.prefill.U5, '1')              // 仍补缺 U5
})

test('exact：核心6全给且命中', () => {
  const r = matchProduct({ U2: 'Z', U5: '1', U6: 'Y', U7: '150Lb', U8: 'C', U9: '100' }, P)
  assert.equal(r.level, 'exact')
  assert.equal(r.count, 35)
  assert.equal(r.filledFields.length, 0)        // 无需补缺
})

test('none + 松散补缺：核心4无命中，按 类型+阀体 给常见值', () => {
  const r = matchProduct({ U2: 'Z', U7: '600Lb', U8: 'C', U9: '999' }, P)
  assert.equal(r.level, 'none')
  assert.ok(r.rows > 0)                          // 退到 Z+C 的松散集
  assert.ok(r.prefill.U9)                        // 给出常见口径建议
})

test('完全无历史 → 空结果', () => {
  const r = matchProduct({ U2: 'D', U7: '150Lb', U8: 'R', U9: '100' }, P)
  assert.equal(r.level, 'none')
  assert.equal(r.rows, 0)
})

test('核心4不全 → 不匹配', () => {
  const r = matchProduct({ U2: 'Z', U8: 'C' }, P)
  assert.equal(r.level, 'none')
  assert.equal(r.rows, 0)
})
