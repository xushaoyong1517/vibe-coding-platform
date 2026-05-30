import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { activateNewVersion } from '@/lib/ruleset-write'

// POST /api/tenants/provision { id, name, clone_rules_from? }
// 后台开通新租户：建 tenants、建 admin（空密码）、可选克隆某租户的牌1/牌2 规则。
// 初期作为脚本接口使用（无需登录）。
export async function POST(req: Request) {
  let body: { id?: string; name?: string; clone_rules_from?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  const name = String(body.name ?? '').trim()
  const cloneFrom = body.clone_rules_from ? String(body.clone_rules_from) : null
  if (!id || !name) return NextResponse.json({ error: '缺少 id 或 name' }, { status: 400 })

  // 1) 租户
  const { error: e1 } = await supabase.from('tenants').upsert({ id, name }, { onConflict: 'id' })
  if (e1) return NextResponse.json({ error: `建租户失败: ${e1.message}` }, { status: 500 })

  // 2) admin 用户（空密码）
  const { error: e2 } = await supabase
    .from('tenant_users')
    .upsert({ tenant_id: id, username: 'admin', role: '系统管理员', password_hash: null }, { onConflict: 'tenant_id,username' })
  if (e2) return NextResponse.json({ error: `建用户失败: ${e2.message}` }, { status: 500 })

  // 3) 可选：克隆规则
  const cloned: Record<string, number> = {}
  if (cloneFrom) {
    const { data: src, error: e3 } = await supabase
      .from('factory_rulesets')
      .select('kind, data')
      .eq('factory_id', cloneFrom)
      .eq('is_active', true)
    if (e3) return NextResponse.json({ error: `读取源规则失败: ${e3.message}` }, { status: 500 })
    for (const row of src ?? []) {
      cloned[row.kind] = await activateNewVersion(id, row.kind, row.data as Record<string, unknown>, `克隆自 ${cloneFrom}`)
    }
  }

  return NextResponse.json({ ok: true, tenant_id: id, name, cloned })
}
