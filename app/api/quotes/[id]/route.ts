import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { projectQuoteItems } from '@/lib/project-quote-items'

// PUT /api/quotes/:id —— 保存报价单编辑（整体覆盖 data）
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const body = await req.json()
  const data = body.data ?? body
  // 状态真列与 data.状态 同写，便于 DB 侧过滤/报表/RLS
  const status = typeof data?.状态 === 'string' && data.状态 ? data.状态 : undefined
  const { error } = await supabase
    .from('quotes')
    .update(status ? { data, status } : { data })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 投影明细行（失败不阻塞主保存）
  await projectQuoteItems(supabase, { ...data, id }, tenantId).catch(() => {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const { error } = await supabase.from('quotes').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
