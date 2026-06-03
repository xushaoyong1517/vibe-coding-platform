import { supabase } from './supabase'
import type { ParamUnits, ParamUnit } from './normalize-params'

// 加载阀门参数库：GLOBAL 基线 + 租户 active 同名单元覆盖。带进程内缓存。

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { units: ParamUnits; at: number }>()

export function invalidateParamUnits(tenantId?: string) {
  if (tenantId) cache.delete(tenantId)
  else cache.clear()
}

export async function loadParamUnits(tenantId: string): Promise<ParamUnits> {
  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.units

  const { data, error } = await supabase
    .from('valve_param_units')
    .select('tenant_id, unit, name_cn, tier, is_core6, entries')
    .in('tenant_id', ['GLOBAL', tenantId])
    .eq('is_active', true)
  if (error) throw new Error(`加载参数库失败: ${error.message}`)

  // 先铺 GLOBAL，再用租户行逐 unit 覆盖
  const rows = (data ?? []).sort((a, b) => (a.tenant_id === 'GLOBAL' ? -1 : 1))
  const units: ParamUnits = {}
  for (const r of rows) {
    units[r.unit] = {
      unit: r.unit, name_cn: r.name_cn, tier: r.tier, is_core6: r.is_core6,
      entries: r.entries as ParamUnit['entries'],
    }
  }
  cache.set(tenantId, { units, at: Date.now() })
  return units
}
