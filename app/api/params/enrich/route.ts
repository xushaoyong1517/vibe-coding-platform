import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { loadParamUnits } from '@/lib/load-param-units'
import { normalizeItem, deriveU6 } from '@/lib/normalize-params'
import { matchProduct, type ProductRow } from '@/lib/match-product'

// POST /api/params/enrich  { items: [...提取后的参数] }
// ② 归一化(查参数库) + ③ 匹配产品库(置信度/历史补缺)。租户由会话决定。
// 返回每条 item 附带 _norm / _unmatched / _match。
export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  let body: { items?: Record<string, unknown>[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: '请求体非法' }, { status: 400 }) }
  const items = Array.isArray(body.items) ? body.items : []

  const [units, prodRes] = await Promise.all([
    loadParamUnits(tenantId),
    supabase.from('valve_products').select('U2,U5,U6,U7,U8,U9,下单次数,full_code').eq('tenant_id', tenantId),
  ])
  if (prodRes.error) return NextResponse.json({ error: prodRes.error.message }, { status: 500 })
  const products = (prodRes.data ?? []) as unknown as ProductRow[]

  // 码 → 中文名（反查字典，用于"历史常见"提示）
  const codeToCn = (unit: string, code: string): string =>
    units[unit]?.entries.find(e => e.code === code)?.cn ?? code

  const enriched = items.map(item => {
    const norm = normalizeItem(item, units)
    // 提取无独立密封面字段 → 从材质串/件号启发式补 U6（密封面维度的精确命中）
    if (!norm.codes.U6) { const u6 = deriveU6(item); if (u6) norm.codes.U6 = u6 }
    const match = matchProduct(norm.codes, products)
    const prefillHint = Object.entries(match.prefill)
      .map(([unit, code]) => ({ unit, unitName: units[unit]?.name_cn ?? unit, code, cn: codeToCn(unit, code) }))
      .filter(h => h.cn !== h.code)  // 反查不到中文名（如产品库旧码 U6=Y）→ 不展示生码
    return { ...item, _norm: norm.codes, _normCn: norm.cn, _unmatched: norm.unmatched, _status: norm.status, _match: match, _prefillHint: prefillHint }
  })

  return NextResponse.json({ ok: true, items: enriched, productCount: products.length })
}
