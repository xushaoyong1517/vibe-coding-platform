// Service Worker（MV3，经典脚本）。跨域同步在此发起（host_permissions 放行）；SQL 写入 sql.js。
importScripts('sql-wasm.js', 'sha3.js', 'blacklake.js', 'sqldb.js')

const OVERLAP_MIN = 15

// ── 复用网页登录态：监听网页发往黑湖的请求，抓取其 X-AUTH 头（登录 token）。──
// 这样扩展同步时直接用网页的 token，不调 _login，不会因「单会话」把网页踢下线。
// 顶层注册 webRequest 监听，匹配请求会唤醒 SW。
let webAuth = null
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const h = details.requestHeaders || []
    const x = h.find(e => e.name.toLowerCase() === 'x-auth')
    if (x && x.value && x.value !== webAuth) {
      webAuth = x.value
      chrome.storage.local.set({ webToken: webAuth, webTokenAt: new Date().toISOString() })
    }
  },
  { urls: ['*://liteweb.blacklake.cn/*'] },
  ['requestHeaders', 'extraHeaders'],
)
// 注入给 blacklake.js：优先内存值，回落 storage（SW 重启后内存丢失）。
setTokenProvider(async () => webAuth || (await chrome.storage.local.get('webToken')).webToken || null)

async function loadConfig() {
  const c = await chrome.storage.local.get(['baseUrl', 'loginType', 'factoryCode', 'username', 'phone', 'password', 'tokenMode'])
  setConfig({
    baseUrl: c.baseUrl || 'https://liteweb.blacklake.cn', loginType: Number(c.loginType ?? 1),
    factoryCode: c.factoryCode || '', username: c.username || '', phone: c.phone || '', password: c.password || '',
    tokenMode: c.tokenMode || 'web',
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
  const s = await chrome.storage.local.get(['lastSyncedAt', 'lastMode', 'tokenMode', 'webToken', 'webTokenAt'])
  return {
    ok: true, counts, lastSyncedAt: s.lastSyncedAt ?? null, lastMode: s.lastMode ?? null, tables: TABLE_NAMES,
    tokenMode: s.tokenMode || 'web', hasWebToken: !!(webAuth || s.webToken), webTokenAt: s.webTokenAt ?? null,
  }
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
