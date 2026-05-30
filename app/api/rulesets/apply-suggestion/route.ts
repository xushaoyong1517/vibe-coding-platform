import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { loadRuleset } from '@/lib/load-ruleset'
import { activateNewVersion } from '@/lib/ruleset-write'
import { resolveFamily } from '@/lib/derive-bom'
import { PAI1_DIRECT_POSITION, specBody } from '@/lib/events'

// POST /api/rulesets/apply-suggestion { valve_spec, 零件, human_value }
// 把一条「反复人工修正」固化进牌1：pai1[族][位] = human_value，写新版本。
// 仅允许牌1直填零件（复合/牌2驱动零件拒绝，避免歧义污染规则）。
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  let body: { valve_spec?: string; 零件?: string; human_value?: string; actor?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }

  const valveSpec = String(body.valve_spec ?? '')
  const 零件 = String(body.零件 ?? '')
  const humanValue = String(body.human_value ?? '')
  if (!valveSpec || !零件 || !humanValue) return NextResponse.json({ error: '缺少 valve_spec/零件/human_value' }, { status: 400 })

  const position = PAI1_DIRECT_POSITION[零件]
  if (!position) return NextResponse.json({ error: `零件「${零件}」非牌1直填项，不能一键固化（需人工映射）` }, { status: 400 })

  const ruleset = await loadRuleset(tenantId)
  if (!ruleset) return NextResponse.json({ error: '无生效规则' }, { status: 404 })
  const family = resolveFamily(specBody(valveSpec), ruleset.pai1)
  if (!family) return NextResponse.json({ error: `主体「${specBody(valveSpec)}」未匹配到规则族` }, { status: 400 })

  // 克隆牌1，改一处，写新版本
  const pai1 = JSON.parse(JSON.stringify(ruleset.pai1)) as Record<string, Record<string, unknown>>
  const old = String(pai1[family][position] ?? '')
  pai1[family][position] = humanValue
  const version = await activateNewVersion(tenantId, 'pai1_body_material', pai1, `固化:${family}.${position} ${old}→${humanValue}`)

  // 审计事件：规则已应用（闭环本身也是事实）
  await supabase.from('events').insert({
    tenant_id: tenantId, event_type: 'rule_applied', actor: String(body.actor ?? 'admin'),
    valve_spec: valveSpec,
    payload: { family, position, 零件, from: old, to: humanValue, pai1_version: version },
  })

  return NextResponse.json({ ok: true, family, position, from: old, to: humanValue, pai1_version: version })
}
