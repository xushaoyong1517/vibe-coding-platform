import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { invalidateParamUnits } from '@/lib/load-param-units'

// POST /api/param-units/import  { units: [{ unit, name_cn?, name_en?, tier?, is_core6?, entries }] }
// 写入当前租户对指定单元的覆盖（GLOBAL 基线之上逐 unit 覆盖）。
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  if (tenantId === 'GLOBAL') return NextResponse.json({ error: '不能直接覆盖 GLOBAL' }, { status: 400 })

  let body: { units?: { unit: string; name_cn?: string; name_en?: string; tier?: string; is_core6?: boolean; entries: unknown[] }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }
  const units = Array.isArray(body.units) ? body.units : []
  if (!units.length) return NextResponse.json({ error: '未提供 units' }, { status: 400 })

  const rows = units
    .filter(u => /^U\d{1,2}$/.test(u.unit) && Array.isArray(u.entries))
    .map(u => ({
      tenant_id: tenantId, unit: u.unit,
      name_cn: u.name_cn ?? null, name_en: u.name_en ?? null,
      tier: u.tier ?? null, is_core6: u.is_core6 ?? false,
      entries: u.entries, version: 1, is_active: true,
    }))
  if (!rows.length) return NextResponse.json({ error: '无合法单元（需 unit=U1..U19 且 entries 为数组）' }, { status: 400 })

  const { data, error } = await supabase
    .from('valve_param_units')
    .upsert(rows, { onConflict: 'tenant_id,unit,version' })
    .select('unit')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateParamUnits(tenantId)
  return NextResponse.json({ ok: true, overridden: data?.map(d => d.unit) ?? [] })
}
