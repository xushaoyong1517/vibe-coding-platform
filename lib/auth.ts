import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'crypto'

// 轻量认证：签名 cookie 会话 + scrypt 密码哈希（均用 Node 内置，零依赖）。
// 面向「客户试跑」：简单但 cookie 防篡改、密码加盐哈希。

const SECRET = process.env.AUTH_SECRET || 'vq-dev-insecure-secret-change-me'
export const SESSION_COOKIE = 'vq_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 天

export interface Session {
  tenant_id: string
  username: string
}

// ── 会话 cookie ────────────────────────────────────────────
function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

export function createSessionCookie(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySessionValue(value: string | undefined): Session | null {
  if (!value) return null
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return null
  const expect = sign(payload)
  // 防时序攻击的等长比较
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (obj && typeof obj.tenant_id === 'string' && typeof obj.username === 'string') return obj
  } catch { /* fall through */ }
  return null
}

/** 从请求 Cookie 头解析会话；无效返回 null */
export function getSession(req: Request): Session | null {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  return verifySessionValue(m?.slice(SESSION_COOKIE.length + 1))
}

/**
 * 取请求所属租户：优先会话 cookie（可信，浏览器自动携带），
 * 回退到显式 query（?tenant_id / ?factory_id，供后台脚本），再回退 fallback。
 */
export function getTenantId(req: Request, fallback = 'yuechiang'): string {
  const s = getSession(req)
  if (s) return s.tenant_id
  try {
    const url = new URL(req.url)
    return url.searchParams.get('tenant_id') || url.searchParams.get('factory_id') || fallback
  } catch {
    return fallback
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
}

// ── 密码哈希（scrypt + 随机盐）───────────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

/** 校验密码。stored 为 null/空 表示「空密码」：任意输入放行（首次登录） */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return true // 空密码账户
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = scryptSync(password, salt, 64)
  const real = Buffer.from(hash, 'hex')
  return test.length === real.length && timingSafeEqual(test, real)
}
