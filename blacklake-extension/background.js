// Service Worker（MV3，经典脚本）。跨域同步在此发起（host_permissions 放行）；SQL 写入 sql.js。
importScripts('sql-wasm.js', 'sha3.js', 'blacklake.js', 'sqldb.js')

const OVERLAP_MIN = 15

async function loadConfig() {
  const c = await chrome.storage.local.get(['baseUrl', 'loginType', 'factoryCode', 'username', 'phone', 'password'])
  setConfig({
    baseUrl: c.baseUrl || 'https://liteweb.blacklake.cn', loginType: Number(c.loginType ?? 1),
    factoryCode: c.factoryCode || '', username: c.username || '', phone: c.phone || '', password: c.password || '',
  })
}

async function sync(mode) {
  await loadConfig()
  let since
  if (mode === 'incremental') {
    const { lastSyncedAt } = await chrome.storage.local.get('lastSyncedAt')
    if (lastSyncedAt) since = toCnDateTime(new Date(new Date(lastSyncedAt).getTime() - OVERLAP_MIN * 60000))
    else mode = 'full'
  }
  const raw = await pullAllRaw(since)
  const mapped = {
    sale_orders: mapSaleOrders(raw.orders),
    customers: mapCustomers(raw.customers),
    products: mapProducts(raw.products),
    materials: mapMaterials(raw.materials),
    stock: mapStock(raw.stock),
  }
  await sqlSync(mode, mapped)
  const counts = {}; for (const [k, v] of Object.entries(mapped)) counts[k] = v.length
  const at = new Date().toISOString()
  await chrome.storage.local.set({ lastSyncedAt: at, lastMode: mode })
  return { ok: true, mode, since: since ?? null, counts, syncedAt: at }
}

async function status() {
  const counts = await sqlCounts()
  const { lastSyncedAt, lastMode } = await chrome.storage.local.get(['lastSyncedAt', 'lastMode'])
  return { ok: true, counts, lastSyncedAt: lastSyncedAt ?? null, lastMode: lastMode ?? null, tables: TABLE_NAMES }
}

async function setSchedule(enabled, minutes) {
  await chrome.alarms.clear('bl-sync')
  if (enabled) await chrome.alarms.create('bl-sync', { periodInMinutes: Math.max(1, Number(minutes) || 60) })
  await chrome.storage.local.set({ scheduleEnabled: !!enabled, scheduleMinutes: Number(minutes) || 60 })
  return { ok: true }
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  ;(async () => {
    try {
      if (msg.action === 'sync') sendResponse(await sync(msg.mode || 'full'))
      else if (msg.action === 'status') sendResponse(await status())
      else if (msg.action === 'saveConfig') { await chrome.storage.local.set(msg.config); sendResponse({ ok: true }) }
      else if (msg.action === 'setSchedule') sendResponse(await setSchedule(msg.enabled, msg.minutes))
      else if (msg.action === 'runSql') {
        if (!/^\s*(select|with|pragma)\b/i.test(msg.sql || '')) { sendResponse({ ok: false, error: '仅允许只读查询（SELECT/WITH/PRAGMA）' }); return }
        sendResponse({ ok: true, ...(await sqlSelect(msg.sql, msg.params)) })
      } else sendResponse({ ok: false, error: 'unknown action' })
    } catch (e) { sendResponse({ ok: false, error: String(e?.message || e) }) }
  })()
  return true   // 异步响应
})

chrome.alarms.onAlarm.addListener(a => { if (a.name === 'bl-sync') sync('incremental').catch(e => console.error('[alarm sync]', e)) })
