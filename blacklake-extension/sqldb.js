// sqldb.js — sql.js(SQLite WASM) 本地库。在 service worker 内运行。
// SW 会休眠 → DB 在内存，写完导出字节持久化到 IndexedDB；唤醒时按需还原。经典脚本（importScripts 加载）。

let SQL = null, db = null

// 五张表的列（与 blacklake.js 映射输出一致）。numeric 列声明 REAL，其余 TEXT，JSON 字段存 TEXT。
const SCHEMA = {
  sale_orders: ['id','order_no','status','customer_code','customer_name','contract_no','order_time','approved_time','end_time','seq','product_code','product_name','product_spec','unit_name','qty','pending_qty','ship_qty','unit_price','amount','arrival_plan_time','custom','raw'],
  customers:   ['id','bl_id','code','name','full_name','contact','phone','address','receivable_days','responsible_users','responsible_groups','custom','raw'],
  products:    ['id','product_code','product_name','product_spec','unit','origin_type','stock_qty','cost_price','sales_price','safety_qty','max_qty','min_qty','process_routing_code','vendor_code','warehouse_code','custom','raw'],
  materials:   ['id','last_product_code','next_product_code','feed_process_code','unit_qty','remark','created_at','updated_at','custom','raw'],
  stock:       ['id','product_id','product_code','product_name','warehouse_id','warehouse_code','warehouse_name','qty_in_warehouse','unit_name','custom','raw'],
}
const NUM = new Set(['status','seq','qty','pending_qty','ship_qty','unit_price','amount','bl_id','receivable_days','origin_type','stock_qty','cost_price','sales_price','safety_qty','max_qty','min_qty','unit_qty','product_id','warehouse_id','qty_in_warehouse'])

function createSchema(d) {
  for (const [t, cols] of Object.entries(SCHEMA)) {
    const defs = cols.map(c => c === 'id' ? 'id TEXT PRIMARY KEY' : `${c} ${NUM.has(c) ? 'REAL' : 'TEXT'}`).join(', ')
    d.run(`CREATE TABLE IF NOT EXISTS ${t} (${defs})`)
    d.run(`CREATE INDEX IF NOT EXISTS ix_${t}_pc ON ${t} (${cols.includes('product_code') ? 'product_code' : 'id'})`)
  }
}

// ── IndexedDB blob 持久化（单 key 存导出的 SQLite 字节）──
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('blsqlite', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function loadBytes() {
  const d = await idb()
  try { return await new Promise((res, rej) => { const r = d.transaction('kv', 'readonly').objectStore('kv').get('db'); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error) }) }
  finally { d.close() }
}
async function saveBytes(bytes) {
  const d = await idb()
  try { await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(bytes, 'db'); t.oncomplete = () => res(); t.onerror = () => rej(t.error) }) }
  finally { d.close() }
}

async function ready() {
  if (db) return db
  if (!SQL) SQL = await initSqlJs({ locateFile: f => chrome.runtime.getURL(f) })
  const bytes = await loadBytes()
  db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database()
  createSchema(db)
  return db
}
async function persist() { if (db) await saveBytes(db.export()) }

function writeTable(d, table, rows, mode) {
  if (mode === 'full') d.run(`DELETE FROM ${table}`)
  if (!rows.length) return
  const cols = SCHEMA[table]
  const ph = cols.map(() => '?').join(',')
  const upd = cols.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',')
  const stmt = d.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${ph}) ON CONFLICT(id) DO UPDATE SET ${upd}`)
  d.run('BEGIN')
  for (const r of rows) stmt.run(cols.map(c => { const v = r[c]; return v != null && typeof v === 'object' ? JSON.stringify(v) : (v ?? null) }))
  d.run('COMMIT')
  stmt.free()
}

/** 写入同步结果。mapped = { sale_orders:[], customers:[], products:[], materials:[], stock:[] } */
async function sqlSync(mode, mapped) {
  const d = await ready()
  for (const [t, rows] of Object.entries(mapped)) writeTable(d, t, rows, mode)
  await persist()
}
/** 只读查询。返回 { columns:[], values:[[]] }。 */
async function sqlSelect(sql, params) {
  const d = await ready()
  const res = d.exec(sql, params || [])
  return res[0] || { columns: [], values: [] }
}
async function sqlCounts() {
  const d = await ready(); const out = {}
  for (const t of Object.keys(SCHEMA)) { const r = d.exec(`SELECT COUNT(*) FROM ${t}`); out[t] = r[0] ? r[0].values[0][0] : 0 }
  return out
}
const TABLE_NAMES = Object.keys(SCHEMA)
