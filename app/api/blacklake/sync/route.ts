import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { pullSalesOrders, pullProducts, pullBomForParents } from '@/lib/blacklake/pull'
import { mapSalesLines, mapBom, mapInventory } from '@/lib/blacklake/map'

// POST /api/blacklake/sync —— 全量拉取黑湖 销售明细/BOM/库存 → 投影三张宽表。
// 用 synced_at=runStamp 标记本轮，写后清理本租户旧行（去除已删除/已结束的陈旧数据）。
export const maxDuration = 300

type Row = Record<string, unknown>

async function upsertFresh(table: string, rows: Row[], tenantId: string, runStamp: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from(table).upsert(chunk)
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
  // 清理陈旧行（本轮没刷新到的）
  const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId).neq('synced_at', runStamp)
  if (error) throw new Error(`${table} cleanup: ${error.message}`)
}

export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  const runStamp = new Date().toISOString()
  try {
    // ① 销售订单(含明细) → 明细宽表
    const orders = await pullSalesOrders()
    const lines = mapSalesLines(orders, tenantId, runStamp)

    // ② BOM：按销售明细出现的父件编码查
    const parents = lines.map(l => String(l.product_code ?? '')).filter(Boolean)
    const bom = mapBom(await pullBomForParents(parents), tenantId, runStamp)

    // ③ 产品(含 stockQty) → 库存余额
    const inv = mapInventory(await pullProducts(), tenantId, runStamp)

    await upsertFresh('bl_sales_order_lines', lines, tenantId, runStamp)
    await upsertFresh('bl_bom', bom, tenantId, runStamp)
    await upsertFresh('bl_inventory', inv, tenantId, runStamp)

    return NextResponse.json({ ok: true, counts: { 销售明细: lines.length, BOM: bom.length, 库存: inv.length }, syncedAt: runStamp })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
