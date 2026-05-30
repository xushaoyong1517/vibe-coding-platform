import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/tenants —— 租户列表（供登录页下拉）。仅返回 id/name，不含敏感信息。
export async function GET() {
  const { data, error } = await supabase.from('tenants').select('id, name').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
