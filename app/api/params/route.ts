import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

// GET /api/params —— 列出本租户阀门产品参数（id + data）。
export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  const { data, error } = await supabase.from('params').select('id, data').eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/params —— 批量 upsert 参数（强制归属当前租户）。body: [{ id, data }, ...]
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  const rows = await req.json() as { id: string; data: unknown }[]
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ ok: true })
  const now = new Date().toISOString()
  const { error } = await supabase.from('params').upsert(
    rows.map(r => ({ id: r.id, data: r.data, updated_at: now, tenant_id: tenantId })),
    { onConflict: 'id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
