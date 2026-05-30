import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

// POST /api/events —— 追加一条事件（不可变）。租户由会话决定。
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }
  if (!body.event_type) return NextResponse.json({ error: '缺少 event_type' }, { status: 400 })

  const row = {
    tenant_id: tenantId,
    event_type: String(body.event_type),
    actor: String(body.actor ?? 'system'),
    correlation_id: body.correlation_id ? String(body.correlation_id) : null,
    quote_id: body.quote_id ? String(body.quote_id) : null,
    valve_spec: body.valve_spec ? String(body.valve_spec) : null,
    refs: body.refs ?? {},
    payload: body.payload ?? {},
    provenance: body.provenance ?? null,
  }
  const { data, error } = await supabase.from('events').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// GET /api/events
//   ?agg=valve_corrections → 按阀型聚合：生成次数 / 纠错次数 / 最常改字段 / 最近
//   否则返回最近事件列表（?limit=, ?quote_id=）
export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  const { searchParams } = new URL(req.url)

  if (searchParams.get('agg') === 'valve_corrections') {
    const { data, error } = await supabase
      .from('events')
      .select('event_type, valve_spec, payload, occurred_at')
      .eq('tenant_id', tenantId)
      .in('event_type', ['bom_generated', 'bom_confirmed'])
      .not('valve_spec', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type Agg = { valve_spec: string; generated: number; corrected: number; delta_count: number; field_counts: Record<string, number>; last: string }
    const map = new Map<string, Agg>()
    for (const e of data ?? []) {
      const spec = e.valve_spec as string
      let a = map.get(spec)
      if (!a) { a = { valve_spec: spec, generated: 0, corrected: 0, delta_count: 0, field_counts: {}, last: e.occurred_at }; map.set(spec, a) }
      if (e.occurred_at > a.last) a.last = e.occurred_at
      if (e.event_type === 'bom_generated') a.generated++
      else if (e.event_type === 'bom_confirmed') {
        a.corrected++
        const deltas = (e.payload as { deltas?: { 零件: string; field: string }[] })?.deltas ?? []
        a.delta_count += deltas.length
        for (const d of deltas) {
          const key = `${d.零件}·${d.field}`
          a.field_counts[key] = (a.field_counts[key] ?? 0) + 1
        }
      }
    }
    const rows = [...map.values()]
      .map(a => {
        const top = Object.entries(a.field_counts).sort((x, y) => y[1] - x[1])[0]
        return {
          valve_spec: a.valve_spec,
          generated: a.generated,
          corrected: a.corrected,
          delta_count: a.delta_count,
          top_field: top ? `${top[0]} ×${top[1]}` : '—',
          correction_rate: a.generated ? Math.round((a.corrected / a.generated) * 100) : null,
          last: a.last,
        }
      })
      .sort((x, y) => y.delta_count - x.delta_count || y.corrected - x.corrected)
    return NextResponse.json(rows)
  }

  // 原始事件列表（最近优先）
  let q = supabase.from('events').select('*').eq('tenant_id', tenantId).order('occurred_at', { ascending: false })
  const quoteId = searchParams.get('quote_id')
  if (quoteId) q = q.eq('quote_id', quoteId)
  q = q.limit(Number(searchParams.get('limit') ?? 100))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
