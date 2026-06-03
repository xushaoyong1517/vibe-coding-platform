// node --test lib/normalize-params.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeField, normalizeItem } from './normalize-params.ts'

// 自带词典 fixture（避免引 valve-code-tables 的解析链）
const UNITS = {
  U2: { unit: 'U2', name_cn: '阀门类型', tier: 'core', is_core6: true, entries: [
    { code: 'Z', cn: '闸阀', aliases: ['闸阀', 'gate'] },
    { code: 'J', cn: '截止阀', aliases: ['截止阀', 'globe'] },
  ]},
  U7: { unit: 'U7', name_cn: '压力等级', tier: 'core', is_core6: true, entries: [
    { code: '150Lb', cn: 'CL150', aliases: ['150', '150磅', 'cl150', 'pn16'] },
    { code: '300Lb', cn: 'CL300', aliases: ['300', '300磅', 'cl300', 'pn40'] },
  ]},
  U8: { unit: 'U8', name_cn: '阀体材料', tier: 'core', is_core6: true, entries: [
    { code: 'C', cn: 'A105/WCB 碳钢', aliases: ['碳钢', 'cs', 'wcb', 'a105', 'a216-wcb'] },
    { code: 'R', cn: '316/CF8M', aliases: ['316', 'cf8m', 'f316'] },
  ]},
  U9: { unit: 'U9', name_cn: '口径', tier: 'core', is_core6: true, entries: [
    { code: '100', cn: 'DN100', aliases: ['100', '4"', '4寸'] },
    { code: '50', cn: 'DN50', aliases: ['50', '2"', '2寸'] },
  ]},
}

test('normalizeField: 标准码/中文/别名 三级命中', () => {
  assert.deepEqual(normalizeField(UNITS.U8.entries, 'C'), { code: 'C', cn: 'A105/WCB 碳钢', via: 'code' })
  assert.deepEqual(normalizeField(UNITS.U2.entries, '闸阀'), { code: 'Z', cn: '闸阀', via: 'cn' })
  assert.equal(normalizeField(UNITS.U8.entries, '碳钢').code, 'C')        // 别名
  assert.equal(normalizeField(UNITS.U8.entries, 'WCB').code, 'C')         // 大小写不敏感
  assert.equal(normalizeField(UNITS.U8.entries, 'A216-WCB').via, 'alias')
})

test('normalizeField: 压力/口径 别名', () => {
  assert.equal(normalizeField(UNITS.U7.entries, 'CL300').code, '300Lb')
  assert.equal(normalizeField(UNITS.U7.entries, 300).code, '300Lb')        // 数字
  assert.equal(normalizeField(UNITS.U7.entries, 'PN40').code, '300Lb')
  assert.equal(normalizeField(UNITS.U9.entries, '4寸').code, '100')
  assert.equal(normalizeField(UNITS.U9.entries, 100).code, '100')          // 直接是码
})

test('normalizeField: 未命中 → none', () => {
  assert.equal(normalizeField(UNITS.U8.entries, '钛合金').via, 'none')
  assert.equal(normalizeField(UNITS.U8.entries, '').via, 'none')
})

test('normalizeItem: 整条归一化 + 未命中收集', () => {
  const r = normalizeItem({ 类型: '闸阀', 压力: 300, 主体: '碳钢', DN: 100 }, UNITS)
  assert.equal(r.codes.U2, 'Z')
  assert.equal(r.codes.U7, '300Lb')
  assert.equal(r.codes.U8, 'C')
  assert.equal(r.codes.U9, '100')
  assert.equal(r.status.主体, 'alias')
  assert.equal(r.unmatched.length, 0)
})

test('normalizeItem: 不认识的主体进 unmatched', () => {
  const r = normalizeItem({ 类型: '闸阀', 主体: '哈氏C276' }, UNITS)
  assert.equal(r.codes.U2, 'Z')
  assert.deepEqual(r.unmatched, ['主体'])
  assert.equal(r.status.主体, 'none')
})
