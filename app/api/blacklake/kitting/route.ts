import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { analyzeKitting, summarizeKitting, type KitOrderLine, type KitBomChild } from '@/lib/kitting'

// GET /api/blacklake/kitting —— 读三张宽表，跑齐套引擎，返回每行齐套状态 + 缺口汇总。
// 需求数量取「待排产数量」(pending_qty)，缺省回落订单数量(qty)。
export async function GET(req: Request) {
  const tenantId = getTenantId(req)

  const [solRes, bomRes, invRes] = await Promise.all([
    supabase.from('bl_sales_order_lines').select('order_no, seq, product_code, product_name, qty, pending_qty, arrival_plan_time, customer_code, status').eq('tenant_id', tenantId),
    supabase.from('bl_bom').select('parent_code, child_code, unit_qty').eq('tenant_id', tenantId),
    supabase.from('bl_inventory').select('product_code, stock_qty').eq('tenant_id', tenantId),
  ])
  const err = solRes.error ?? bomRes.error ?? invRes.error
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 })

  // 明细行（只看还需生产的：待排产>0，或无待排产字段时用订单数量）
  const lines: KitOrderLine[] = (solRes.data ?? []).map(r => ({
    订单号: r.order_no ?? '',
    行号: Number(r.seq ?? 0),
    父件编码: r.product_code ?? '',
    父件名称: r.product_name ?? undefined,
    需求数量: Number(r.pending_qty ?? r.qty ?? 0),
    交期: r.arrival_plan_time ?? undefined,
    客户: r.customer_code ?? undefined,
  })).filter(l => l.需求数量 > 0)

  // BOM：父→子(单层)。同一子件多行(不同投料工序)按子件编码合并用量。
  const bomAcc: Record<string, Map<string, number>> = {}
  for (const r of bomRes.data ?? []) {
    const p = r.parent_code ?? ''
    const c = r.child_code ?? ''
    if (!p || !c) continue
    const m = (bomAcc[p] ??= new Map())
    m.set(c, (m.get(c) ?? 0) + Number(r.unit_qty ?? 1))
  }
  const bom: Record<string, KitBomChild[]> = {}
  for (const [p, m] of Object.entries(bomAcc)) {
    bom[p] = [...m.entries()].map(([子件编码, 用量]) => ({ 子件编码, 用量 }))
  }

  // 库存：产品编码 → 现存总数
  const inventory: Record<string, number> = {}
  for (const r of invRes.data ?? []) {
    if (r.product_code) inventory[r.product_code] = Number(r.stock_qty ?? 0)
  }

  const { results, remaining } = analyzeKitting(lines, bom, inventory)
  const summary = summarizeKitting(results)
  return NextResponse.json({ ok: true, summary, results, remaining })
}
