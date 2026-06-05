// node --test lib/kitting-workbench.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkbench } from './kitting-workbench.ts'

const BOM = {
  'Z4-150WCB': [
    { 子件编码: '3002013', 用量: 1 },
    { 子件编码: '2002013', 用量: 1 },
    { 子件编码: '1002013', 用量: 1 },
  ],
}
const META = {
  '3002013': { name: 'Z40闸板', spec: 'Z40闸板-150LB-WCB-DN100', attr: '外购' },
  '2002013': { name: 'Z40阀盖', spec: 'Z40阀盖-150LB-WCB-DN100', attr: '外购' },
  '1002013': { name: 'Z40阀体', spec: 'Z40阀体-150LB-WCB-DN100', attr: '自制' },
}
const REF = '2025-03-15'

test('状态分级：齐套 / 部分齐套 / 全缺 / 无BOM', () => {
  const lines = [
    { order: 'O1', customer: '甲', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 2, due: '2025-03-20' },
    { order: 'O2', customer: '乙', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 10, due: '2025-04-20' },
    { order: 'O3', customer: '丙', pcode: '未知阀', pspec: 'Q41-150LB-WCB-DN50', openq: 1, due: '2025-04-01' },
  ]
  // 库存：闸板 5、阀盖 1、阀体充足 → O1(早)先扣齐套；O2 闸板余3<10 缺、阀盖0缺、阀体够 → 部分齐套
  const inv = { '3002013': 5, '2002013': 2, '1002013': 999 }
  const { lines: out, kpi } = buildWorkbench(lines, BOM, inv, META, REF)
  const o1 = out.find(l => l.order === 'O1')
  const o2 = out.find(l => l.order === 'O2')
  const o3 = out.find(l => l.order === 'O3')
  assert.equal(o1.status, '齐套')
  assert.equal(o1.rate, 100)
  assert.equal(o2.status, '部分齐套')          // 阀体够，闸板/阀盖缺
  assert.equal(o2.short_items, 2)
  assert.equal(o2.total_items, 3)
  assert.equal(o3.status, '无BOM')
  assert.equal(kpi.kit, 1)
  assert.equal(kpi.partial, 1)
  assert.equal(kpi.nobom, 1)
})

test('family / 口径 由规格解析', () => {
  const lines = [{ order: 'O', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 1 }]
  const { lines: out } = buildWorkbench(lines, BOM, { '3002013': 9, '2002013': 9, '1002013': 9 }, META, REF)
  assert.equal(out[0].family, '闸阀')
  assert.equal(out[0].caliber, 'DN100')
  assert.equal(out[0].model, 'Z40')
})

test('缺料汇总：demand=Σ需求, net=demand-可用, orders=缺口订单数', () => {
  const lines = [
    { order: 'A', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 5, due: '2025-03-10' },
    { order: 'B', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 5, due: '2025-03-20' },
  ]
  const inv = { '3002013': 3, '2002013': 999, '1002013': 999 }   // 闸板总需求10，可用3
  const { shortage } = buildWorkbench(lines, BOM, inv, META, REF)
  const s = shortage.find(x => x.code === '3002013')
  assert.ok(s)
  assert.equal(s.demand, 10)
  assert.equal(s.avail, 3)
  assert.equal(s.net, 7)
  assert.equal(s.orders, 2)                    // 库存3被早交期A占满后A仍缺2、晚交期B缺5 → 两单皆缺
})

test('负库存按 0 计可分配，但 onhand 原样展示', () => {
  const lines = [{ order: 'A', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 1 }]
  const inv = { '3002013': -400, '2002013': 5, '1002013': 5 }
  const { lines: out } = buildWorkbench(lines, BOM, inv, META, REF)
  const comp = out[0].comp.find(c => c.code === '3002013')
  assert.equal(comp.onhand, -400)              // 展示原值
  assert.equal(comp.alloc, 0)                  // 负库存不可分配
  assert.equal(comp.gap, 1)
})

test('在途合成确定性 + 在途可齐套标记', () => {
  const lines = [{ order: 'A', pcode: 'Z4-150WCB', pspec: 'Z40-150LB-WCB-DN100', openq: 1, due: '2025-04-01' }]
  const inv = { '3002013': 0, '2002013': 0, '1002013': 0 }   // 全缺
  const r1 = buildWorkbench(lines, BOM, inv, META, REF)
  const r2 = buildWorkbench(lines, BOM, inv, META, REF)
  // 确定性：两次结果一致
  assert.deepEqual(r1.shortage.map(s => [s.code, s.intransit, s.eta]), r2.shortage.map(s => [s.code, s.intransit, s.eta]))
  // 若三子件在途均全覆盖，则该行 transitKit=true
  const full = r1.lines[0].comp.every(c => c._afterGap === 0)
  assert.equal(r1.lines[0].transitKit, full)
})
