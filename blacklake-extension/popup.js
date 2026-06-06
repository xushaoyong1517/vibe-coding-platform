const $ = id => document.getElementById(id)
const send = m => chrome.runtime.sendMessage(m)
const LABEL = { sale_orders:'销售订单', customers:'客户', products:'产品', materials:'物料清单', stock:'库存余额' }
async function refresh() {
  const s = await send({ action:'status' })
  if (!s?.ok) { $('counts').textContent = s?.error || ''; return }
  if (s.tokenMode === 'web') {
    $('tok').innerHTML = s.hasWebToken
      ? '<span style="color:#2a7a4b">● 已复用网页登录态（不挤掉网页）</span>'
      : '<span style="color:#b07d10">● 未捕获网页登录态：请先登录小工单网页并点一下页面</span>'
  } else $('tok').innerHTML = '<span style="color:#c0392b">● 账号密码登录模式（会把网页踢下线）</span>'
  $('counts').innerHTML = Object.entries(s.counts).map(([k,v]) => `<div class="row"><span>${LABEL[k]||k}</span><b>${v}</b></div>`).join('')
  $('last').textContent = s.lastSyncedAt ? '上次同步：' + new Date(s.lastSyncedAt).toLocaleString('zh-CN') + (s.lastMode === 'full' ? ' · 全量' : s.lastMode === 'incremental' ? ' · 增量' : '') : '尚未同步'
}
const run = mode => async () => {
  $('msg').textContent = '同步中…'; $('full').disabled = $('inc').disabled = true
  const r = await send({ action:'sync', mode })
  $('msg').textContent = r.ok ? '完成，共 ' + Object.values(r.counts).reduce((a,b)=>a+b,0) + ' 行' : '失败：' + r.error
  $('full').disabled = $('inc').disabled = false; refresh()
}
$('full').onclick = run('full'); $('inc').onclick = run('incremental')
$('opt').onclick = () => chrome.runtime.openOptionsPage()
$('browse').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('browse.html') })
refresh()
