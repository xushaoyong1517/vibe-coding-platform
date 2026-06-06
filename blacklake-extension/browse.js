const $ = id => document.getElementById(id)
const send = m => chrome.runtime.sendMessage(m)
const TABS = [['sale_orders','销售订单'],['customers','客户'],['products','产品'],['materials','物料清单'],['stock','库存余额']]
let cur = 'sale_orders'
const colCache = {}

function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) }
function render(res){
  const t = $('tbl')
  if (!res.columns.length){ t.innerHTML = '<tr><td>无数据</td></tr>'; return }
  const head = '<thead><tr>' + res.columns.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead>'
  const body = '<tbody>' + res.values.map(row => '<tr>' + row.map(v => { const s = v == null ? '' : String(v); return `<td title="${esc(s)}">${esc(s.length > 80 ? s.slice(0,80)+'…' : s)}</td>` }).join('') + '</tr>').join('') + '</tbody>'
  t.innerHTML = head + body
}
async function cols(table){
  if (colCache[table]) return colCache[table]
  const r = await send({ action:'runSql', sql:`PRAGMA table_info(${table})` })
  const names = r.ok ? r.values.map(v => v[1]) : []   // table_info: (cid,name,...)
  colCache[table] = names; return names
}
async function load(){
  const term = $('q').value.trim()
  let sql, params
  if (!term){ sql = `SELECT * FROM ${cur} LIMIT 500`; params = [] }
  else { const cs = await cols(cur); sql = `SELECT * FROM ${cur} WHERE ` + cs.map(c => `${c} LIKE ?`).join(' OR ') + ' LIMIT 500'; params = cs.map(() => `%${term}%`) }
  const r = await send({ action:'runSql', sql, params })
  if (!r.ok){ $('info').textContent = '错误：' + r.error; render({columns:[],values:[]}); return }
  $('info').textContent = `${r.values.length} 行` + (r.values.length === 500 ? '（上限 500）' : '')
  render(r)
}
function buildTabs(){
  $('tabs').innerHTML = ''
  for (const [k,label] of TABS){
    const d = document.createElement('div'); d.className = 'tab' + (k === cur ? ' on' : ''); d.textContent = label
    d.onclick = () => { cur = k; $('q').value = ''; buildTabs(); load() }
    $('tabs').appendChild(d)
  }
}
$('go').onclick = load
$('q').onkeydown = e => { if (e.key === 'Enter') load() }
$('runsql').onclick = async () => {
  const r = await send({ action:'runSql', sql: $('sql').value, params: [] })
  if (!r.ok){ $('info').textContent = '错误：' + r.error; render({columns:[],values:[]}); return }
  $('info').textContent = `${r.values.length} 行`; render(r)
}
buildTabs(); load()
