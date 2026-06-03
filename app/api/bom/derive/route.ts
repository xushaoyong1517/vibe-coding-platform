import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { loadRuleset } from '@/lib/load-ruleset'
import { deriveBOM } from '@/lib/derive-bom'
import { fillTemplate, type TemplateRow } from '@/lib/fill-template'
import { buildBomFromSkeleton, type SkeletonPart } from '@/lib/build-bom'
import { getTenantId } from '@/lib/auth'

// POST /api/bom/derive
// 入参：{ 主体|bodyMaterial, 件号|trimNo, DN|dn, factory_id?, bom_template?, codes?, 驱动?, 类型? }
// 骨架优先级：① 历史报价BOM(codes命中) → ② 小样图骨架 → ③ 标准15行
// 材质一律按牌1/牌2规则填(骨架材质仅参考)；含{{占位符}}的旧模板走 fillTemplate 兼容。
export async function POST(req: Request) {
  const factoryId = getTenantId(req)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 }) }

  const bodyMaterial = String(body.主体 ?? body.bodyMaterial ?? '')
  const trimNo = String(body.件号 ?? body.trimNo ?? '')
  const dn = Number(body.DN ?? body.dn ?? 0)
  const template = Array.isArray(body.bom_template) ? (body.bom_template as TemplateRow[]) : null
  const codes = (body.codes && typeof body.codes === 'object') ? body.codes as Record<string, string> : null
  const drive = String(body.驱动 ?? '')
  if (!bodyMaterial || !trimNo) return NextResponse.json({ ok: false, error: '缺少 主体 或 件号' }, { status: 400 })

  let ruleset
  try { ruleset = await loadRuleset(factoryId) } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }) }
  if (!ruleset) return NextResponse.json({ ok: false, error: `工厂「${factoryId}」无生效规则` }, { status: 404 })

  const input = { bodyMaterial, trimNo, dn }

  // ① 历史报价 BOM 骨架（codes 命中：类型U2 + 结构U5 + 驱动）
  if (codes?.U2) {
    const hist = await findHistorySkeleton(factoryId, codes, drive)
    if (hist) {
      const r = buildBomFromSkeleton(hist, input, ruleset, '历史')
      return NextResponse.json({ ok: r.bom.length > 0, bom: r.bom, 牌1: r.牌1, 牌2: r.牌2, warnings: r.warnings, mode: 'history' })
    }
  }

  // ② 小样图骨架
  if (template?.length) {
    const hasPlaceholder = template.some(r => /\{\{/.test(String(r.材质 ?? '')))
    if (hasPlaceholder) {
      // 旧式占位符模板 → fillTemplate 兼容
      const derived = deriveBOM(input, ruleset)
      const matOf = (part: string) => derived.bom.find(r => r.零件 === part)?.材质
      const placeholders: Record<string, string | number | undefined> = {
        ...(body as Record<string, string | number | undefined>),
        主体: bodyMaterial,
        阀杆轴: (body.阀杆轴 as string) || matOf('阀杆'),
        阀瓣阀闸: (body.阀瓣阀闸 as string) || matOf('阀瓣/闸板'),
        阀座: (body.阀座 as string) || matOf('阀座'),
      }
      const { rows, unresolved } = fillTemplate(template, placeholders, dn)
      const warnings = [...derived.warnings]
      if (unresolved.length) warnings.push(`模板未解析占位符：${unresolved.join('、')}`)
      return NextResponse.json({ ok: rows.length > 0, bom: rows, 牌1: derived.牌1, 牌2: derived.牌2, warnings, mode: 'template' })
    }
    // 骨架模板 → 规则填材质
    const r = buildBomFromSkeleton(template as SkeletonPart[], input, ruleset, '小样图')
    return NextResponse.json({ ok: r.bom.length > 0, bom: r.bom, 牌1: r.牌1, 牌2: r.牌2, warnings: r.warnings, mode: 'skeleton' })
  }

  // ③ 标准 15 行
  const derived = deriveBOM(input, ruleset)
  return NextResponse.json({ ok: derived.bom.length > 0, ...derived, mode: 'standard' })
}

// 在本租户历史明细里找骨架：类型U2(索引) + 结构U5 + 驱动 一致、且该行已有 BOM。
// 查 quote_items 投影表（codes 建索引），取代旧版"内存扫 300 块 quotes JSON"。
async function findHistorySkeleton(tenantId: string, codes: Record<string, string>, drive: string): Promise<SkeletonPart[] | null> {
  const { data, error } = await supabase
    .from('quote_items')
    .select('data, bom, codes')
    .eq('tenant_id', tenantId)
    .eq('codes->>U2', codes.U2)
    .not('bom', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error || !data) return null   // 表未建/无命中 → 回落小样图/标准骨架
  for (const row of data) {
    const c = row.codes as Record<string, string> | null
    const sameStruct = (c?.U5 ?? '') === (codes.U5 ?? '')
    const sameDrive = ((row.data as { 驱动?: string } | null)?.驱动 ?? '') === drive
    const bom = (row.bom as { bom?: SkeletonPart[] } | null)?.bom
    if (sameStruct && sameDrive && bom?.length) {
      return bom.map(b => ({ 零件: b.零件 }))  // 只取骨架(零件名)，材质规则重填
    }
  }
  return null
}
