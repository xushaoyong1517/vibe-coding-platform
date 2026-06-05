import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

// GET /api/quotes —— 列出本租户报价单（id + data），供前端加载。
export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  const { data, error } = await supabase
    .from('quotes')
    .select('id, data')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/quotes —— 新建报价单（强制归属当前租户）。
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  const b = await req.json()
  const { error } = await supabase.from('quotes').insert({
    id: b.id, salesperson: b.salesperson ?? null, data: b.data, status: b.status ?? b.data?.状态 ?? null, tenant_id: tenantId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
