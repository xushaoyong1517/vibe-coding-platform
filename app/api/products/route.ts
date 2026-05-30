import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  const { data, error } = await supabase
    .from('valve_products')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  const body = await req.json()
  const row = { ...body, tenant_id: tenantId }  // 强制归属当前租户
  const { data, error } = await supabase
    .from('valve_products')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
