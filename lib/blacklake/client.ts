import crypto from 'node:crypto'

// 黑湖小工单 OpenAPI 客户端（服务端专用）。
// 登录拿 token(无过期，珍惜登录额度 75/时) → 业务接口走 X-AUTH 头 → 401 重登一次。
// 业务成功码 = "01000000"（注意：登录成功码是 statusCode===200）。

const BASE = process.env.BLACKLAKE_BASE_URL || 'https://liteweb.blacklake.cn'
const LOGIN_TYPE = Number(process.env.BLACKLAKE_LOGIN_TYPE ?? '1')   // 1=工厂码+账号 0=手机号
const FACTORY_CODE = process.env.BLACKLAKE_FACTORY_CODE || ''
const USERNAME = process.env.BLACKLAKE_USERNAME || ''
const PHONE = process.env.BLACKLAKE_PHONE || ''
const PASSWORD = process.env.BLACKLAKE_PASSWORD || ''

const OK = '01000000'                         // 业务成功码

let cachedToken: string | null = null
// 登录单航（single-flight）：并发请求共享同一次登录，避免多次登录互相顶号导致 401。
// （黑湖 token 无过期但单会话有效，且登录额度 75/时，必须避免并发重复登录。）
let loginInflight: Promise<string> | null = null

/**
 * 取可用 token：默认复用缓存；force 时重新登录。
 * @param staleToken 触发重登的那个失效 token —— 若缓存已被其它并发请求换成新 token，则直接复用，不重复登录。
 */
async function ensureToken(force = false, staleToken?: string): Promise<string> {
  if (cachedToken && (!force || (staleToken != null && cachedToken !== staleToken))) return cachedToken
  if (!loginInflight) {
    loginInflight = login().finally(() => { loginInflight = null })
  }
  return loginInflight
}

/** 密码必须 SHA3-224 哈希后传，明文报错。Node 自带，无需第三方库。 */
function hashPassword(pwd: string): string {
  return crypto.createHash('sha3-224').update(pwd, 'utf8').digest('hex')
}

/** 登录换 token。返回鉴权 token 字符串。 */
async function login(): Promise<string> {
  if (!PASSWORD) throw new Error('未配置 BLACKLAKE_PASSWORD')
  const body: Record<string, unknown> = { type: LOGIN_TYPE, password: hashPassword(PASSWORD) }
  if (LOGIN_TYPE === 1) { body.code = FACTORY_CODE; body.username = USERNAME }
  else { body.phone = PHONE }

  const res = await fetch(`${BASE}/api/user/v1/users/_login`, {
    method: 'POST',
    headers: { 'X-CLIENT': 'lite-web', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as { statusCode?: number; message?: string; data?: string }
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(`黑湖登录失败: ${json.statusCode} ${json.message ?? ''}`)
  }
  cachedToken = json.data
  return cachedToken
}

interface BlResponse<T = unknown> {
  code?: string
  subCode?: string
  msg?: string
  message?: string
  data?: T
  page?: { pageNum: number; pageSize: number; total: number }
}

async function call<T>(path: string, body: unknown, token: string): Promise<BlResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'X-AUTH': token, 'X-CLIENT': 'lite-web', 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json().catch(() => ({})) as Promise<BlResponse<T>>
}

/** 业务请求：自动带 token，401 重登一次后重试。返回整个响应（含 data/page）。 */
export async function blFetch<T = unknown>(path: string, body: unknown): Promise<BlResponse<T>> {
  let token = await ensureToken()
  let resp = await call<T>(path, body, token)
  // token 失效：code=401 / subCode=USER_VERIFICATION_ERROR → 重登一次（并发下共享同一次重登）
  if (resp.code === '401' || resp.subCode === 'USER_VERIFICATION_ERROR') {
    token = await ensureToken(true, token)
    resp = await call<T>(path, body, token)
  }
  if (resp.code !== OK) {
    throw new Error(`黑湖接口失败 ${path}: ${resp.code} ${resp.msg ?? resp.message ?? ''}`)
  }
  return resp
}

/** 供测试/排障：清掉缓存 token。 */
export function resetToken() { cachedToken = null; loginInflight = null }
