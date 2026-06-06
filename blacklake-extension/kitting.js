// 齐套分析（移植自主项目 lib/kitting.ts）。数据来自本地 SQLite 三张表，经 runSql 取回后在页内计算。
const $ = id => document.getElementById(id)
const send = m => chrome.runtime.sendMessage(m)
async function q(sql) { const r = await send({ action: 'runSql', sql }); if (!r.ok) throw new Error(r.error); return r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) }
const n = v => (v == null || v === '' ? 0 : Number(v))

// ── 引擎：按交期升序统筹扣减库存，逐行判齐套/缺料 ──
const FAR = '9999-99-99'
function analyzeKitting(lines, bom, inventory) {
  const avail = { ...inventory }
  const sorted = [...lines].sort((a, b) => (a.due || FAR).localeCompare(b.due || FAR) || a.order.localeCompare(b.order) || a.seq - b.seq)
  const results = []
  for (const line of sorted) {
    const children = bom[line.parent]
    if (!children || !children.length) { results.push({ ...line, status: '无BOM', children: [] }); continue }
    const rows = []; let short = false, need = 0, have = 0
    for (const c of children) {
      const req = line.qty * c.qty
      const has = avail[c.code] || 0
      const got = Math.min(req, has)
      avail[c.code] = has - got
      const gap = req - got
      if (gap > 0) short = true
      need += req; have += got
      rows.push({ code: c.code, name: c.name, spec: c.spec, origin: c.origin, need: req, have: got, gap })
    }
    results.push({ ...line, status: short ? '缺料' : '齐套', children: rows, rate: need ? Math.round(100 * have / need) : 100 })
  }
  return results
}
function summarize(results) {
  const counts = { '齐套': 0, '缺料': 0, '无BOM': 0 }
  const gap = new Map()
  for (const r of results) {
    counts[r.status]++
    for (const c of r.children) {
      if (c.gap <= 0) continue
      const g = gap.get(c.code) || { code: c.code, name: c.name, spec: c.spec, origin: c.origin, total: 0, orders: new Set() }
      g.total += c.gap; g.orders.add(r.order); gap.set(c.code, g)
    }
  }
  const shortage = [...gap.values()].map(g => ({ ...g, orders: g.orders.size })).sort((a, b) => b.total - a.total)
  return { counts, shortage }
}

let RESULTS = [], SUM = { counts: {}, shortage: [] }, STOCK = {}
let tab = 'orders', filter = '全部', term = ''

async function loadAll() {
  const [orders, mats, prods] = await Promise.all([
    q('SELECT order_no,seq,product_code,product_name,qty,pending_qty,customer_name,arrival_plan_time FROM sale_orders'),
    q('SELECT last_product_code,next_product_code,unit_qty FROM materials'),
    q('SELECT product_code,product_name,product_spec,stock_qty,origin_type FROM products'),
  ])
  const ORIGIN = { 0: '自制', 1: '外购', 2: '委外' }
  const prodBy = {}; STOCK = {}
  for (const p of prods) { prodBy[p.product_code] = { name: p.product_name, spec: p.product_spec, origin: ORIGIN[n(p.origin_type)] || '', stock: n(p.stock_qty) }; STOCK[p.product_code] = n(p.stock_qty) }
  // BOM：父→子（同子件合并用量）
  const bom = {}
  for (const m of mats) {
    const par = m.last_product_code, ch = m.next_product_code; if (!par || !ch) continue
    ;(bom[par] = bom[par] || {})[ch] = (bom[par][ch] || 0) + n(m.unit_qty)
  }
  for (const par of Object.keys(bom)) bom[par] = Object.entries(bom[par]).map(([code, qty]) => ({ code, qty, name: prodBy[code]?.name, spec: prodBy[code]?.spec, origin: prodBy[code]?.origin }))
  // 明细行：需求=待排产优先，回落订单数量；>0 且有父件
  const lines = orders.map(o => ({ order: o.order_no || '', seq: n(o.seq), parent: o.product_code || '', parentName: o.product_name, customer: o.customer_name || '', due: o.arrival_plan_time || '', qty: n(o.pending_qty) || n(o.qty) })).filter(l => l.qty > 0 && l.parent)
  RESULTS = analyzeKitting(lines, bom, STOCK)
  SUM = summarize(RESULTS)
  render()
}

function kpiCards() {
  const c = SUM.counts, total = RESULTS.length
  const cards = [
    ['#0e6b62', total, '待齐产订单行', ''],
    ['#2a7a4b', c['齐套'] || 0, '可立即生产', '物料齐套'],
    ['#c0392b', c['缺料'] || 0, '缺料', '需先采购'],
    ['#777', c['无BOM'] || 0, '无BOM', '未维护物料清单'],
    ['#b8862a', SUM.shortage.length, '缺料种类', '汇总采购'],
  ]
  $('kpis').innerHTML = cards.map(([col, num, lab, sub]) => `<div class="kpi"><i style="background:${col}"></i><b style="color:${col}">${num}</b><div>${lab}${sub ? ' · ' + sub : ''}</div></div>`).join('')
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])) }
const STBADGE = { '齐套': 'b-ok', '缺料': 'b-short', '无BOM': 'b-nobom' }

function renderBar() {
  if (tab === 'orders') {
    const chips = ['全部', '齐套', '缺料', '无BOM']
    $('bar').innerHTML = `<input id="q" placeholder="搜订单号/客户/父件…" value="${esc(term)}">` + chips.map(c => `<span class="chip ${filter === c ? 'on' : ''}" data-f="${c}">${c}</span>`).join('')
    $('q').oninput = e => { term = e.target.value.trim(); renderTable() }
    $('bar').querySelectorAll('.chip').forEach(el => el.onclick = () => { filter = el.dataset.f; renderBar(); renderTable() })
  } else {
    $('bar').innerHTML = `<input id="q" placeholder="搜子件编码/名称…" value="${esc(term)}">`
    $('q').oninput = e => { term = e.target.value.trim(); renderTable() }
  }
}
function renderTable() {
  const t = $('tbl'); const tl = term.toLowerCase()
  if (tab === 'orders') {
    let rows = RESULTS
    if (filter !== '全部') rows = rows.filter(r => r.status === filter)
    if (tl) rows = rows.filter(r => (r.order + r.customer + r.parent + (r.parentName || '')).toLowerCase().includes(tl))
    $('info').textContent = `${rows.length} 行` + (rows.length > 800 ? '（仅显示前 800）' : '')
    rows = rows.slice(0, 800)
    t.innerHTML = '<thead><tr><th>订单号</th><th>客户</th><th>父件编码</th><th>父件名称</th><th>需求</th><th>交期</th><th>状态</th><th>齐套率</th><th>缺料项</th></tr></thead><tbody>' +
      rows.map(r => {
        const miss = r.children.filter(c => c.gap > 0).length, tot = r.children.length
        const rate = r.status === '无BOM' ? '—' : `<span class="bar2"><i style="width:${r.rate}%;background:${r.rate >= 100 ? '#2a7a4b' : r.rate >= 50 ? '#b07d10' : '#c0392b'}"></i></span> ${r.rate}%`
        return `<tr><td>${esc(r.order)}</td><td>${esc(r.customer)}</td><td>${esc(r.parent)}</td><td>${esc(r.parentName)}</td><td class="num">${r.qty}</td><td>${esc((r.due || '').slice(0, 10))}</td><td><span class="badge ${STBADGE[r.status]}">${r.status}</span></td><td>${rate}</td><td class="num">${tot ? miss + '/' + tot : '—'}</td></tr>`
      }).join('') + '</tbody>'
  } else {
    let rows = SUM.shortage
    if (tl) rows = rows.filter(s => (s.code + (s.name || '')).toLowerCase().includes(tl))
    $('info').textContent = `${rows.length} 种缺料`
    t.innerHTML = '<thead><tr><th>子件编码</th><th>名称</th><th>规格</th><th>属性</th><th>缺口合计</th><th>现有库存</th><th>受影响订单</th></tr></thead><tbody>' +
      rows.map(s => `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${esc(s.spec)}</td><td>${esc(s.origin)}</td><td class="num" style="color:#c0392b;font-weight:700">${Math.round(s.total * 100) / 100}</td><td class="num">${STOCK[s.code] || 0}</td><td class="num">${s.orders}</td></tr>`).join('') + '</tbody>'
  }
}
function render() { kpiCards(); renderBar(); renderTable() }

document.querySelectorAll('.tab').forEach(el => el.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); el.classList.add('on')
  tab = el.dataset.t; term = ''; filter = '全部'; render()
})
loadAll().catch(e => { $('info').textContent = '加载失败：' + e.message })
