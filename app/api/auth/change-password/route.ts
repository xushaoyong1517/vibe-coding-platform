import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession, verifyPassword, hashPassword } from '@/lib/auth'

// POST /api/auth/change-password { old_password, new_password }
export async function POST(req: Request) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  let body: { old_password?: string; new_password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }

  const newPw = String(body.new_password ?? '')
  if (newPw.length < 4) return NextResponse.json({ error: '新密码至少 4 位' }, { status: 400 })

  const { data: user, error } = await supabase
    .from('tenant_users')
    .select('password_hash')
    .eq('tenant_id', session.tenant_id)
    .eq('username', session.username)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

  // 已设密码则校验旧密码；空密码账户首次设置无需旧密码
  if (user.password_hash && !verifyPassword(String(body.old_password ?? ''), user.password_hash)) {
    return NextResponse.json({ error: '原密码错误' }, { status: 401 })
  }

  const { error: e2 } = await supabase
    .from('tenant_users')
    .update({ password_hash: hashPassword(newPw), must_change_pw: false })
    .eq('tenant_id', session.tenant_id)
    .eq('username', session.username)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
