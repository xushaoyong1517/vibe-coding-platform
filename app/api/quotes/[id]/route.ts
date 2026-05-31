import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

// PUT /api/quotes/:id —— 保存报价单编辑（整体覆盖 data）
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const body = await req.json()
  const data = body.data ?? body
  const { error } = await supabase
    .from('quotes')
    .update({ data })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const { error } = await supabase.from('quotes').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
