import { supabase } from '@/lib/supabase'
import { pullAllRaw } from './pull.ts'
import { mapSaleOrders, mapCustomers, mapProducts, mapMaterials, mapStock } from './map.ts'

// 黑湖同步核心：全量(full) / 增量(incremental, 有更新的同步)。手动接口与定时任务共用。
//  · full        ：拉全量 → upsert → 清理本轮未刷新的陈旧行(反映删除)。重置水位。
//  · incremental ：以上次水位为起点按 updatedAt 拉「更新过的」→ 仅 upsert，不删。推进水位。
// 库存接口无 updatedAt 过滤：随产品回落，增量时仅覆盖有变更的产品（每日 full 兜底全量刷新）。

type Row = Record<string, unknown>
export type SyncMode = 'full' | 'incremental'

const TABLES = {
  bl_sale_orders: mapSaleOrders,
  bl_customers: mapCustomers,
  bl_products: mapProducts,
  bl_materials: mapMaterials,
  bl_stock: mapStock,
} as const

// 增量水位回看缓冲（分钟）：抵消时钟偏差/同步耗时，避免漏掉边界记录。upsert 幂等，重叠无害。
const OVERLAP_MIN = 15

/** Date → 黑湖期望的本地时间串 'yyyy-MM-dd HH:mm:ss'（Asia/Shanghai，避免 UTC 偏移漏数据）。 */
function toCnDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)!.value
  const hour = g('hour') === '24' ? '00' : g('hour')   // Intl 在 00:xx 偶发返回 '24'
  return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}:${g('second')}`
}

async function upsert(table: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500))
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
}

/** 同步一个租户。返回各源条数与本轮水位。 */
export async function runSync(tenantId: string, mode: SyncMode): Promise<{ mode: SyncMode; since: string | null; counts: Record<string, number>; syncedAt: string }> {
  const runStamp = new Date().toISOString()

  // 增量：读上次水位作为 updatedAt 起点；无水位(首跑)则退化为全量。
  let since: string | null = null
  let effectiveMode: SyncMode = mode
  if (mode === 'incremental') {
    const { data } = await supabase.from('bl_sync_state').select('last_synced_at').eq('tenant_id', tenantId).maybeSingle()
    const watermark = data?.last_synced_at as string | undefined
    if (watermark) {
      since = toCnDateTime(new Date(new Date(watermark).getTime() - OVERLAP_MIN * 60_000))
    } else {
      effectiveMode = 'full'   // 没有水位 → 首次全量
    }
  }

  const raw = await pullAllRaw({ updatedSince: since ?? undefined })
  const sources: Record<keyof typeof TABLES, Row[]> = {
    bl_sale_orders: raw.orders,
    bl_customers: raw.customers,
    bl_products: raw.products,
    bl_materials: raw.materials,
    bl_stock: raw.stock,
  }

  const counts: Record<string, number> = {}
  for (const [table, mapper] of Object.entries(TABLES)) {
    const rows = (mapper as (r: Row[], t: string, s: string) => Row[])(sources[table as keyof typeof TABLES], tenantId, runStamp)
    counts[table] = rows.length
    await upsert(table, rows)
    // 全量才清理陈旧行（反映删除）；增量只增量更新，不动未变更行。
    if (effectiveMode === 'full') {
      const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId).neq('synced_at', runStamp)
      if (error) throw new Error(`${table} cleanup: ${error.message}`)
    }
  }

  // 推进水位
  const { error: wmErr } = await supabase.from('bl_sync_state').upsert({
    tenant_id: tenantId, last_synced_at: runStamp, last_mode: effectiveMode, last_counts: counts, updated_at: runStamp,
  })
  if (wmErr) throw new Error(`bl_sync_state upsert: ${wmErr.message}（请先执行 20260605_blacklake_sync_state.sql 迁移）`)

  return { mode: effectiveMode, since, counts, syncedAt: runStamp }
}
