import { supabase } from './supabase'
import type { FactoryRuleset, Pai1Family, Pai2Trim } from './valve-rules/types'

// 从 DB 按工厂加载生效中的牌1/牌2规则，带进程内缓存（默认 5 分钟）。
// 缓存按 factory_id 维度；改规则后可调 invalidateRuleset 清除。

const TTL_MS = 5 * 60 * 1000
type CacheEntry = { ruleset: FactoryRuleset; at: number }
const cache = new Map<string, CacheEntry>()

export function invalidateRuleset(factoryId?: string) {
  if (factoryId) cache.delete(factoryId)
  else cache.clear()
}

export async function loadRuleset(factoryId: string): Promise<FactoryRuleset | null> {
  const hit = cache.get(factoryId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ruleset

  const { data, error } = await supabase
    .from('factory_rulesets')
    .select('kind,data')
    .eq('factory_id', factoryId)
    .eq('is_active', true)
  if (error) throw new Error(`加载规则失败(${factoryId}): ${error.message}`)
  if (!data?.length) return null

  const pai1 = data.find((r) => r.kind === 'pai1_body_material')?.data as Record<string, Pai1Family> | undefined
  const pai2 = data.find((r) => r.kind === 'pai2_internals')?.data as Record<string, Pai2Trim> | undefined
  if (!pai1 || !pai2) return null

  const ruleset: FactoryRuleset = { factory_id: factoryId, pai1, pai2 }
  cache.set(factoryId, { ruleset, at: Date.now() })
  return ruleset
}
