import type { SupabaseClient } from '@supabase/supabase-js'

// 把一张报价单的 items[] / bomData[] 投影成 quote_items 行（删旧插新，保证无残留）。
// quotes.data 仍是 UI 权威源；本表是查询优化副本（历史骨架匹配 / 行级状态）。

interface QuoteLike {
  id: string
  items?: Array<Record<string, unknown>>
  bomData?: Array<Record<string, unknown> | null>
}

/** 行级状态：由是否已生成 BOM 推导（后续可在 UI 细化为 已确认/BOM已确认）。 */
function deriveLineStatus(bom: unknown): string {
  return bom ? 'BOM已生成' : '待确认'
}

export async function projectQuoteItems(
  supabase: SupabaseClient, quote: QuoteLike, tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!quote?.id) return { ok: false, error: '缺少 quote.id' }
  const items = Array.isArray(quote.items) ? quote.items : []
  const bomData = Array.isArray(quote.bomData) ? quote.bomData : []

  const rows = items.map((it, i) => {
    const bom = bomData[i] ?? null
    const codes = (it.codes && typeof it.codes === 'object') ? it.codes : null
    return {
      id: `${quote.id}#${i}`,
      quote_id: quote.id,
      tenant_id: tenantId,
      line_no: i,
      codes,
      code: typeof it.code === 'string' ? it.code : null,
      status: deriveLineStatus(bom),
      data: it,
      bom,
      updated_at: new Date().toISOString(),
    }
  })

  // 删旧（含被删除的行），再插新
  const del = await supabase.from('quote_items').delete().eq('quote_id', quote.id).eq('tenant_id', tenantId)
  if (del.error) return { ok: false, error: del.error.message }
  if (rows.length === 0) return { ok: true }
  const ins = await supabase.from('quote_items').insert(rows)
  if (ins.error) return { ok: false, error: ins.error.message }
  return { ok: true }
}
