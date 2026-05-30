import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSessionCookie, verifyPassword, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

// POST /api/auth/login { tenant_id, password }
export async function POST(req: Request) {
  let body: { tenant_id?: string; username?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }

  const tenantId = String(body.tenant_id ?? '')
  const username = String(body.username ?? 'admin')
  const password = String(body.password ?? '')
  if (!tenantId) return NextResponse.json({ error: '请选择租户' }, { status: 400 })

  const { data: user, error } = await supabase
    .from('tenant_users')
    .select('tenant_id, username, password_hash, must_change_pw, role')
    .eq('tenant_id', tenantId)
    .eq('username', username)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!user) return NextResponse.json({ error: '租户或用户不存在' }, { status: 401 })

  if (!verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }

  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle()

  const res = NextResponse.json({
    ok: true,
    tenant_id: tenantId,
    name: tenant?.name ?? tenantId,
    username: user.username,
    role: user.role,
    must_change_pw: user.must_change_pw,
    empty_password: !user.password_hash,
  })
  res.cookies.set(SESSION_COOKIE, createSessionCookie({ tenant_id: tenantId, username }), sessionCookieOptions)
  return res
}
