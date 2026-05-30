import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const { data, error } = await supabase
    .from('valve_products').select('*').eq('id', id).eq('tenant_id', tenantId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const body = await req.json()
  const { tenant_id: _ignore, ...patch } = body  // 禁止跨租户改归属
  const { data, error } = await supabase
    .from('valve_products').update(patch).eq('id', id).eq('tenant_id', tenantId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const { error } = await supabase.from('valve_products').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
