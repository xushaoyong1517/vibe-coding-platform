// Service Worker（MV3）：编排同步。跨域请求在此发起，靠 manifest host_permissions 放行（无 CORS 限制）。
import { setConfig, pullAllRaw, mapSaleOrders, mapCustomers, mapProducts, mapMaterials, mapStock, toCnDateTime } from './blacklake.js'
import { putAll, clearStore, count, setMeta, getMeta, STORES } from './db.js'

const MAP = { sale_orders: mapSaleOrders, customers: mapCustomers, products: mapProducts, materials: mapMaterials, stock: mapStock }
const RAWKEY = { sale_orders: 'orders', customers: 'customers', products: 'products', materials: 'materials', stock: 'stock' }
const OVERLAP_MIN = 15

async function loadConfig() {
  const c = await chrome.storage.local.get(['baseUrl','loginType','factoryCode','username','phone','password'])
  setConfig({ baseUrl: c.baseUrl || 'https://liteweb.blacklake.cn', loginType: Number(c.loginType ?? 1), factoryCode: c.factoryCode || '', username: c.username || '', phone: c.phone || '', password: c.password || '' })
}

async function sync(mode) {
  await loadConfig()
  let since
  if (mode === 'incremental') {
    const wm = await getMeta('lastSyncedAt')
    if (wm) since = toCnDateTime(new Date(new Date(wm).getTime() - OVERLAP_MIN * 60000))
    else mode = 'full'
  }
  const raw = await pullAllRaw(since)
  const counts = {}
  for (const store of STORES) {
    const rows = MAP[store](raw[RAWKEY[store]])
    if (mode === 'full') await clearStore(store)   // 全量先清空（增量只增量写入）
    await putAll(store, rows)
    counts[store] = rows.length
  }
  const at = new Date().toISOString()
  await setMeta('lastSyncedAt', at); await setMeta('lastMode', mode)
  return { ok: true, mode, since: since ?? null, counts, syncedAt: at }
}

async function status() {
  const counts = {}
  for (const s of STORES) counts[s] = await count(s)
  return { counts, lastSyncedAt: await getMeta('lastSyncedAt'), lastMode: await getMeta('lastMode') }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.action === 'sync') sendResponse(await sync(msg.mode || 'full'))
      else if (msg.action === 'status') sendResponse(await status())
      else if (msg.action === 'saveConfig') { await chrome.storage.local.set(msg.config); sendResponse({ ok: true }) }
      else sendResponse({ ok: false, error: 'unknown action' })
    } catch (e) { sendResponse({ ok: false, error: String(e?.message || e) }) }
  })()
  return true   // 异步响应
})

// 可选：定时增量（chrome.alarms）。需在 manifest permissions 加 "alarms"。
chrome.alarms?.onAlarm.addListener(a => { if (a.name === 'bl-sync') sync('incremental').catch(() => {}) })
