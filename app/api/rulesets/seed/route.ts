import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { yuechiangRuleset } from '@/lib/valve-rules/yuechiang'

// POST /api/rulesets/seed —— 把越强牌1/牌2基线灌入 factory_rulesets
export async function POST() {
  const { factory_id, pai1, pai2 } = yuechiangRuleset
  const rows = [
    { factory_id, kind: 'pai1_body_material', data: pai1, version: 1, is_active: true, note: '越强基线·牌1' },
    { factory_id, kind: 'pai2_internals',     data: pai2, version: 1, is_active: true, note: '越强基线·牌2' },
  ]
  const { data, error } = await supabase
    .from('factory_rulesets')
    .upsert(rows, { onConflict: 'factory_id,kind,version' })
    .select('factory_id,kind,version')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, seeded: data })
}
