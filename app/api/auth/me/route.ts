import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET /api/auth/me —— 返回当前会话租户信息（前端据此获知 tenant_id）
export async function GET(req: Request) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 })

  const { data: user } = await supabase
    .from('tenant_users')
    .select('role, must_change_pw, password_hash')
    .eq('tenant_id', session.tenant_id)
    .eq('username', session.username)
    .maybeSingle()
  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', session.tenant_id).maybeSingle()

  return NextResponse.json({
    authenticated: true,
    tenant_id: session.tenant_id,
    name: tenant?.name ?? session.tenant_id,
    username: session.username,
    role: user?.role ?? '系统管理员',
    must_change_pw: user?.must_change_pw ?? false,
    empty_password: !user?.password_hash,
  })
}
