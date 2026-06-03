import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { buildGlobalParamUnits } from '@/lib/valve-rules/param-units-global'
import { invalidateParamUnits } from '@/lib/load-param-units'

// POST /api/param-units/seed —— 把 GLOBAL 19 单元（词典+别名）灌入 valve_param_units
export async function POST() {
  const units = buildGlobalParamUnits()
  const rows = units.map(u => ({
    tenant_id: 'GLOBAL', unit: u.unit, name_cn: u.name_cn, name_en: u.name_en,
    tier: u.tier, is_core6: u.is_core6, entries: u.entries, version: 1, is_active: true,
  }))
  const { data, error } = await supabase
    .from('valve_param_units')
    .upsert(rows, { onConflict: 'tenant_id,unit,version' })
    .select('unit, is_core6')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateParamUnits()  // 清缓存，重灌即生效
  return NextResponse.json({
    ok: true,
    units: data?.length ?? 0,
    core6: data?.filter(d => d.is_core6).map(d => d.unit),
    alias_total: units.reduce((n, u) => n + u.entries.reduce((m, e) => m + e.aliases.length, 0), 0),
  })
}
