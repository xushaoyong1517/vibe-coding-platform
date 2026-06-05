import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { type KitBomChild } from '@/lib/kitting'
import { buildWorkbench, type WbLineInput, type WbChildMeta } from '@/lib/kitting-workbench'

// GET /api/blacklake/kitting —— 读三张宽表，跑齐套工作台引擎，返回五视图完整数据集。
// 需求数量取「待排产数量」(pending_qty)，缺省回落订单数量(qty)。
// 参考基准日默认取「今天」(交期倒计时与在途 ETA 用)；?ref=yyyy-MM-dd 可覆盖(便于样例对齐)。
export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  const url = new URL(req.url)
  const ref = url.searchParams.get('ref') || new Date().toISOString().slice(0, 10)

  // 数据源切到五张贴源表：销售订单 bl_sale_orders / 物料清单 bl_materials / 产品 bl_products(含库存与属性)
  const [solRes, bomRes, invRes] = await Promise.all([
    supabase.from('bl_sale_orders').select('order_no, seq, product_code, product_name, product_spec, qty, pending_qty, arrival_plan_time, customer_code, status, synced_at').eq('tenant_id', tenantId),
    supabase.from('bl_materials').select('last_product_code, next_product_code, unit_qty').eq('tenant_id', tenantId),
    supabase.from('bl_products').select('product_code, product_name, product_spec, origin_type, stock_qty').eq('tenant_id', tenantId),
  ])
  const err = solRes.error ?? bomRes.error ?? invRes.error
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 })

  // 明细行（只看还需生产的：待排产>0，或无待排产字段时用订单数量）
  const lines: WbLineInput[] = (solRes.data ?? []).map(r => ({
    order: r.order_no ?? '',
    seq: Number(r.seq ?? 0),
    customer: r.customer_code ?? undefined,
    pcode: r.product_code ?? '',
    pname: r.product_name ?? undefined,
    pspec: r.product_spec ?? undefined,
    qty: Number(r.qty ?? 0),
    openq: Number(r.pending_qty ?? r.qty ?? 0),
    due: r.arrival_plan_time ?? undefined,
  })).filter(l => l.openq > 0 && l.pcode)

  // BOM：父→子(单层)。同一子件多行(不同投料工序)按子件编码合并用量。
  const bomAcc: Record<string, Map<string, number>> = {}
  for (const r of bomRes.data ?? []) {
    const p = r.last_product_code ?? ''
    const c = r.next_product_code ?? ''
    if (!p || !c) continue
    const m = (bomAcc[p] ??= new Map())
    m.set(c, (m.get(c) ?? 0) + Number(r.unit_qty ?? 1))
  }
  const bom: Record<string, KitBomChild[]> = {}
  for (const [p, m] of Object.entries(bomAcc)) {
    bom[p] = [...m.entries()].map(([子件编码, 用量]) => ({ 子件编码, 用量 }))
  }

  // 库存(子件分配 + 成品库存关联) + 子件元数据(名称/规格/属性)
  const ORIGIN: Record<number, string> = { 0: '自制', 1: '外购', 2: '委外' }
  const inventory: Record<string, number> = {}
  const childMeta: Record<string, WbChildMeta> = {}
  for (const r of invRes.data ?? []) {
    const code = r.product_code
    if (!code) continue
    inventory[code] = Number(r.stock_qty ?? 0)
    childMeta[code] = {
      name: r.product_name ?? undefined,
      spec: r.product_spec ?? undefined,
      attr: r.origin_type != null ? ORIGIN[Number(r.origin_type)] ?? '外购' : '外购',
    }
  }
  // 成品库存：父件产品在库存表的现存数（展示用）
  for (const l of lines) l.fg_stock = inventory[l.pcode] ?? 0

  // 同步时间：三张宽表同一轮 sync 共用同一 synced_at，取任一行即可
  const syncedAt = (solRes.data ?? []).reduce<string | null>((mx, r) => {
    const s = (r as { synced_at?: string | null }).synced_at ?? null
    return s && (!mx || s > mx) ? s : mx
  }, null)

  const data = buildWorkbench(lines, bom, inventory, childMeta, ref)
  return NextResponse.json({ ok: true, syncedAt, ...data })
}
