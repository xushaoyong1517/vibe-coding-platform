const $ = id => document.getElementById(id)
const send = msg => chrome.runtime.sendMessage(msg)
const LABEL = { sale_orders: '销售订单', customers: '客户', products: '产品', materials: '物料清单', stock: '库存余额' }

async function refresh() {
  const s = await send({ action: 'status' })
  $('counts').innerHTML = Object.entries(s.counts).map(([k, v]) => `<div class="row"><span>${LABEL[k]}</span><b>${v}</b></div>`).join('')
  if (s.lastSyncedAt) {
    const mode = s.lastMode === 'full' ? '全量' : s.lastMode === 'incremental' ? '增量' : ''
    $('last').textContent = '上次同步：' + new Date(s.lastSyncedAt).toLocaleString('zh-CN') + (mode ? ' · ' + mode : '')
  } else $('last').textContent = '尚未同步'
}
async function loadCfg() {
  const c = await chrome.storage.local.get(['loginType', 'factoryCode', 'username', 'phone', 'password'])
  $('loginType').value = String(c.loginType ?? 1)
  $('factory').value = c.factoryCode || ''
  $('user').value = c.username || ''
  $('phone').value = c.phone || ''
  $('pwd').value = c.password || ''
}
$('save').onclick = async () => {
  await send({ action: 'saveConfig', config: {
    loginType: Number($('loginType').value), factoryCode: $('factory').value.trim(),
    username: $('user').value.trim(), phone: $('phone').value.trim(), password: $('pwd').value,
  } })
  $('msg').textContent = '配置已保存'
}
function run(mode) {
  return async () => {
    $('msg').textContent = '同步中…'
    $('full').disabled = $('inc').disabled = true
    const r = await send({ action: 'sync', mode })
    $('msg').textContent = r.ok ? '完成，共 ' + Object.values(r.counts).reduce((a, b) => a + b, 0) + ' 行' : '失败：' + r.error
    $('full').disabled = $('inc').disabled = false
    refresh()
  }
}
$('full').onclick = run('full')
$('inc').onclick = run('incremental')
loadCfg(); refresh()
