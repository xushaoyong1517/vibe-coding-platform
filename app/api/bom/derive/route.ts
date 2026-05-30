import { NextResponse } from 'next/server'
import { loadRuleset } from '@/lib/load-ruleset'
import { deriveBOM } from '@/lib/derive-bom'
import { fillTemplate, type TemplateRow } from '@/lib/fill-template'
import { getTenantId } from '@/lib/auth'

// POST /api/bom/derive
// 入参：{ 主体|bodyMaterial, 件号|trimNo, DN|dn, factory_id?, bom_template?, ...其余客户参数 }
//   无 bom_template → 标准 15 行确定性 BOM
//   有 bom_template → 确定性模板填充（占位符代入 + 按DN数量），缺失材质回退推导值
// 返回：{ ok, bom, 牌1, 牌2, warnings, mode }
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const factoryId = getTenantId(req)  // 租户由会话决定
  const bodyMaterial = String(body.主体 ?? body.bodyMaterial ?? '')
  const trimNo = String(body.件号 ?? body.trimNo ?? '')
  const dn = Number(body.DN ?? body.dn ?? 0)
  const template = Array.isArray(body.bom_template) ? (body.bom_template as TemplateRow[]) : null

  if (!bodyMaterial || !trimNo) {
    return NextResponse.json({ ok: false, error: '缺少 主体 或 件号' }, { status: 400 })
  }

  let ruleset
  try {
    ruleset = await loadRuleset(factoryId)
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
  if (!ruleset) {
    return NextResponse.json({ ok: false, error: `工厂「${factoryId}」无生效规则` }, { status: 404 })
  }

  const derived = deriveBOM({ bodyMaterial, trimNo, dn }, ruleset)

  // ── 模板模式：确定性填充骨架 ──────────────────────────────
  if (template?.length) {
    const matOf = (part: string) => derived.bom.find((r) => r.零件 === part)?.材质
    // 占位符字典：客户参数优先，缺失回退推导值
    const placeholders: Record<string, string | number | undefined> = {
      ...(body as Record<string, string | number | undefined>),
      主体: bodyMaterial,
      阀杆轴: (body.阀杆轴 as string) || matOf('阀杆'),
      阀瓣阀闸: (body.阀瓣阀闸 as string) || matOf('阀瓣/闸板'),
      阀座: (body.阀座 as string) || matOf('阀座'),
    }
    const { rows, unresolved } = fillTemplate(template, placeholders, dn)
    const warnings = [...derived.warnings]
    if (unresolved.length) warnings.push(`模板未解析占位符：${unresolved.join('、')}，需补充参数或核对`)
    return NextResponse.json({ ok: rows.length > 0, bom: rows, 牌1: derived.牌1, 牌2: derived.牌2, warnings, mode: 'template' })
  }

  // ── 标准模式：15 行确定性 BOM ─────────────────────────────
  return NextResponse.json({ ok: derived.bom.length > 0, ...derived, mode: 'standard' })
}
