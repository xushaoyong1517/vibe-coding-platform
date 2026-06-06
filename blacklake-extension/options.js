const $ = id => document.getElementById(id)
const send = m => chrome.runtime.sendMessage(m)
async function load() {
  const c = await chrome.storage.local.get(['loginType','factoryCode','username','phone','password','baseUrl','scheduleEnabled','scheduleMinutes'])
  $('loginType').value = String(c.loginType ?? 1)
  $('factory').value = c.factoryCode || ''; $('user').value = c.username || ''; $('phone').value = c.phone || ''
  $('pwd').value = c.password || ''; $('baseUrl').value = c.baseUrl || 'https://liteweb.blacklake.cn'
  $('schedEnabled').checked = !!c.scheduleEnabled; $('schedMin').value = c.scheduleMinutes || 60
}
$('save').onclick = async () => {
  await send({ action:'saveConfig', config: {
    loginType: Number($('loginType').value), factoryCode: $('factory').value.trim(), username: $('user').value.trim(),
    phone: $('phone').value.trim(), password: $('pwd').value, baseUrl: $('baseUrl').value.trim() || 'https://liteweb.blacklake.cn',
  } })
  await send({ action:'setSchedule', enabled: $('schedEnabled').checked, minutes: Number($('schedMin').value) })
  $('msg').textContent = '已保存' + ($('schedEnabled').checked ? `，每 ${$('schedMin').value} 分钟增量同步` : '')
}
load()
