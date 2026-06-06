// 黑湖小工单对接（浏览器扩展 service worker 内运行；跨域靠 manifest host_permissions 放行）。

let CFG = { baseUrl: 'https://liteweb.blacklake.cn', loginType: 1, factoryCode: '', username: '', phone: '', password: '' }
function setConfig(c) { CFG = { ...CFG, ...c } }

const OK = '01000000'
let token = null, loginInflight = null

async function login() {
  if (!CFG.password) throw new Error('未配置密码')
  const body = { type: CFG.loginType, password: sha3_224(CFG.password) }
  if (CFG.loginType === 1) { body.code = CFG.factoryCode; body.username = CFG.username } else { body.phone = CFG.phone }
  const res = await fetch(`${CFG.baseUrl}/api/user/v1/users/_login`, {
    method: 'POST', headers: { 'X-CLIENT': 'lite-web', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (j.statusCode !== 200 || !j.data) throw new Error(`黑湖登录失败: ${j.statusCode} ${j.message ?? ''}`)
  token = j.data
  return token
}
async function ensureToken(force = false, stale) {
  if (token && (!force || (stale != null && token !== stale))) return token
  if (!loginInflight) loginInflight = login().finally(() => { loginInflight = null })
  return loginInflight
}
async function call(path, body, tok) {
  const res = await fetch(`${CFG.baseUrl}${path}`, {
    method: 'POST', headers: { 'X-AUTH': tok, 'X-CLIENT': 'lite-web', 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  })
  return res.json().catch(() => ({}))
}
async function blFetch(path, body) {
  let tok = await ensureToken()
  let resp = await call(path, body, tok)
  if (resp.code === '401' || resp.subCode === 'USER_VERIFICATION_ERROR') { tok = await ensureToken(true, tok); resp = await call(path, body, tok) }
  if (resp.code !== OK) throw new Error(`黑湖接口失败 ${path}: ${resp.code} ${resp.msg ?? resp.message ?? ''}`)
  return resp
}

// ── 分页抓取 ──
const PAGE = 100
const str = v => (v == null ? '' : String(v))
async function pullTop(path, base) {
  const out = []
  for (let n = 1; ; n++) { const r = await blFetch(path, { ...base, page: { pageNum: n, pageSize: PAGE } }); const l = Array.isArray(r.data) ? r.data : []; out.push(...l); if (out.length >= (r.page?.total ?? out.length) || !l.length) break }
  return out
}
async function pullNested(path, base) {
  const out = []
  for (let n = 1; ; n++) { const r = await blFetch(path, { ...base, page: { pageNum: n, pageSize: PAGE } }); const l = Array.isArray(r.data?.data) ? r.data.data : []; out.push(...l); if (out.length >= (r.data?.total ?? out.length) || !l.length) break }
  return out
}
const pullSalesOrders = (s) => pullTop('/api/dytin/external/saleOrder/queryList2', { status: [0,10,20], ...(s ? { updatedAtGte: s } : {}) })
const pullProducts = (s) => pullNested('/api/dytin/external/product/queryList2', s ? { updatedAtStart: s } : {})
const pullMaterials = (s) => pullNested('/api/dytin/external/materials/queryList', { updatedAtGte: s || '2000-01-01 00:00:00' })
async function pullCustomers(s) {
  const out = [], base = s ? { updatedAtStart: s } : { createdAtStart: '2000-01-01 00:00:00' }
  for (let n = 1; ; n++) {
    const r = await blFetch('/api/dytin/external/customer/queryList', { ...base, page: { pageNum: n, pageSize: PAGE } })
    const top = Array.isArray(r.data) ? r.data : null
    const nested = !top && Array.isArray(r.data?.data) ? r.data.data : null
    const l = top ?? nested ?? []; out.push(...l)
    const total = top ? (r.page?.total ?? out.length) : (r.data?.total ?? out.length)
    if (out.length >= total || !l.length) break
  }
  return out
}
async function pullStock(pairs) {
  const valid = pairs.filter(p => p.productCode && p.warehouseCode), out = []
  for (let i = 0; i < valid.length; i += 100) {
    const r = await blFetch('/api/dytin/external/stock/queryStockInfoDetail', { stockInfoQryOpenApiCOList: valid.slice(i, i+100).map(p => ({ productCode: p.productCode, warehouseCode: p.warehouseCode })) })
    if (Array.isArray(r.data)) out.push(...r.data)
  }
  return out
}
const stockFromProducts = (products) => products.filter(p => p.productCode != null && p.stockQty != null).map(p => ({ productId: p.id ?? null, productCode: p.productCode, productName: p.productName, warehouseCode: null, warehouseName: null, qtyInWarehouse: p.stockQty, unitName: p.unit }))

async function pullAllRaw(updatedSince) {
  const [customers, products, orders] = await Promise.all([pullCustomers(updatedSince), pullProducts(updatedSince), pullSalesOrders(updatedSince)])
  const materials = await pullMaterials(updatedSince)
  const real = await pullStock(products.map(p => ({ productCode: str(p.productCode), warehouseCode: str(p.warehouseCode) })))
  const stock = real.length ? real : stockFromProducts(products)
  return { customers, products, orders, materials, stock }
}

// ── 映射：原始 → 行（含自定义字段平铺）──
const num = v => (v == null || v === '' ? null : Number(v))
const txt = v => (v == null || v === '' ? null : String(v))
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v)
const json = v => (Array.isArray(v) || isObj(v) ? v : null)
const CF_N = ['fieldName','attributeName','customFieldName','name','label','fieldCode','code']
const CF_V = ['fieldValue','attributeValue','customFieldValue','fieldValueName','valueName','displayValue','choiceValue','value','val']
function flattenCustom(...objs) {
  const out = {}
  for (const obj of objs) for (const v of Object.values(obj)) {
    if (!Array.isArray(v) || !v.length || !isObj(v[0])) continue
    const nk = CF_N.find(k => k in v[0]), vk = CF_V.find(k => k in v[0]); if (!nk || !vk) continue
    for (const it of v) { if (!isObj(it)) continue; const nm = str(it[nk]); if (!nm) continue; const raw = it[vk]; out[nm] = raw == null ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : raw) }
  }
  return out
}
function mapSaleOrders(orders) {
  const out = []
  for (const o of orders) {
    const ds = Array.isArray(o.saleManageOrderDetailRowApiVOList) ? o.saleManageOrderDetailRowApiVOList : []
    for (const d of (ds.length ? ds : [{}])) out.push({
      id: `${str(o.orderNo)}#${str(d.seq) || '0'}`, order_no: txt(o.orderNo), status: num(o.status),
      customer_code: txt(o.customerCode), customer_name: txt(o.customerName), contract_no: txt(o.contractNo),
      order_time: txt(o.orderTime), approved_time: txt(o.approvedTime), end_time: txt(o.endTime),
      seq: num(d.seq), product_code: txt(d.productCode), product_name: txt(d.productName), product_spec: txt(d.productSpec),
      unit_name: txt(d.productUnitName), qty: num(d.qty), pending_qty: num(d.pendingAmount), ship_qty: num(d.productShipmentQty),
      unit_price: num(d.unitPrice), amount: num(d.amount), arrival_plan_time: txt(d.arrivalPlanTime ?? o.arrivalPlanTime),
      custom: flattenCustom(d, o), raw: d,
    })
  }
  return out
}
const mapCustomers = (cs) => cs.map(c => ({ id: str(c.code), bl_id: num(c.id), code: txt(c.code), name: txt(c.name), full_name: txt(c.fullName), contact: txt(c.contact), phone: txt(c.phone), address: txt(c.address), receivable_days: num(c.receivableDays), responsible_users: json(c.responsibleUsers), responsible_groups: json(c.responsibleGroups), custom: flattenCustom(c), raw: c }))
const mapProducts = (ps) => ps.map(p => ({ id: str(p.productCode), product_code: txt(p.productCode), product_name: txt(p.productName), product_spec: txt(p.productSpecification), unit: txt(p.unit), origin_type: num(p.originType), stock_qty: num(p.stockQty), cost_price: num(p.costPrice), sales_price: num(p.salesPrice), safety_qty: num(p.safetyQty), max_qty: num(p.maxQty), min_qty: num(p.minQty), process_routing_code: txt(p.prcessRoutingCode), vendor_code: txt(p.vendorCode), warehouse_code: txt(p.warehouseCode), custom: flattenCustom(p), raw: p }))
const mapMaterials = (rs) => rs.map(r => ({ id: `${str(r.lastProductCode)}#${str(r.nextProductCode)}#${str(r.feedProcessCode)}`, last_product_code: txt(r.lastProductCode), next_product_code: txt(r.nextProductCode), feed_process_code: txt(r.feedProcessCode), unit_qty: num(r.unitQty), remark: txt(r.remark), created_at: txt(r.createdAt), updated_at: txt(r.updatedAt), custom: flattenCustom(r), raw: r }))
const mapStock = (ss) => ss.map(s => ({ id: `${str(s.productCode)}#${str(s.warehouseCode)}`, product_id: num(s.productId), product_code: txt(s.productCode), product_name: txt(s.productName), warehouse_id: num(s.warehouseId), warehouse_code: txt(s.warehouseCode), warehouse_name: txt(s.warehouseName), qty_in_warehouse: num(s.qtyInWarehouse), unit_name: txt(s.unitName), custom: flattenCustom(s), raw: s }))

/** Date → 'yyyy-MM-dd HH:mm:ss'（Asia/Shanghai），增量水位用。 */
function toCnDateTime(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
  const g = t => p.find(x => x.type === t).value
  const h = g('hour') === '24' ? '00' : g('hour')
  return `${g('year')}-${g('month')}-${g('day')} ${h}:${g('minute')}:${g('second')}`
}
