import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { projectQuoteItems } from '@/lib/project-quote-items'

// POST /api/quotes/:id/project —— 从 DB 读权威报价单，重投影 quote_items（新建后调用）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = getTenantId(req)
  const { data: row, error } = await supabase
    .from('quotes').select('data').eq('id', id).eq('tenant_id', tenantId).single()
  if (error || !row) return NextResponse.json({ error: error?.message ?? '报价单不存在' }, { status: 404 })
  const r = await projectQuoteItems(supabase, { ...(row.data as object), id }, tenantId)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
