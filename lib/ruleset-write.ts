import { supabase } from './supabase'
import { invalidateRuleset } from './load-ruleset'
import type { Pai1Family, Pai2Trim } from './valve-rules/types'

// 规则写入层：把上传的规则以「新版本」写入 factory_rulesets，
// 自动停用旧版本、激活新版本、清缓存。

export type RulesetKind = 'pai1_body_material' | 'pai2_internals'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 从多种上传形态中提取 pai1(families) / pai2(map)：
 *   - { pai1, pai2 }
 *   - 规范 JSON { pai1_body_material: { families }, pai2_internals: { map } }
 *   - { families } / { map }
 * 返回 null 表示该牌未提供。校验失败抛错。
 */
export function normalizeImport(body: unknown): {
  pai1: Record<string, Pai1Family> | null
  pai2: Record<string, Pai2Trim> | null
} {
  if (!isPlainObject(body)) throw new Error('上传内容不是对象')

  const pai1Raw =
    (isPlainObject(body.pai1) && body.pai1) ||
    (isPlainObject(body.pai1_body_material) && isPlainObject(body.pai1_body_material.families) && body.pai1_body_material.families) ||
    (isPlainObject(body.families) && body.families) ||
    null
  const pai2Raw =
    (isPlainObject(body.pai2) && body.pai2) ||
    (isPlainObject(body.pai2_internals) && isPlainObject(body.pai2_internals.map) && body.pai2_internals.map) ||
    (isPlainObject(body.map) && body.map) ||
    null

  if (!pai1Raw && !pai2Raw) throw new Error('未找到牌1(families)或牌2(map)数据')

  if (pai1Raw) {
    const sample = Object.values(pai1Raw)[0]
    if (!isPlainObject(sample) || (!('applies_to' in sample) && !('body' in sample)))
      throw new Error('牌1格式不符：每个材质族应含 applies_to / body 字段')
  }
  if (pai2Raw) {
    const sample = Object.values(pai2Raw)[0]
    if (!isPlainObject(sample) || (!('gate_seal' in sample) && !('seat_seal' in sample)))
      throw new Error('牌2格式不符：每个件号应含 gate_seal / seat_seal 字段')
  }

  return {
    pai1: (pai1Raw as Record<string, Pai1Family>) ?? null,
    pai2: (pai2Raw as Record<string, Pai2Trim>) ?? null,
  }
}

/** 以新版本写入并激活某一牌；返回新版本号 */
export async function activateNewVersion(
  factoryId: string,
  kind: RulesetKind,
  data: Record<string, unknown>,
  note?: string,
): Promise<number> {
  const { data: latest, error: e1 } = await supabase
    .from('factory_rulesets')
    .select('version')
    .eq('factory_id', factoryId)
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1)
  if (e1) throw new Error(e1.message)
  const nextVersion = (latest?.[0]?.version ?? 0) + 1

  const { error: e2 } = await supabase
    .from('factory_rulesets')
    .update({ is_active: false })
    .eq('factory_id', factoryId)
    .eq('kind', kind)
    .eq('is_active', true)
  if (e2) throw new Error(e2.message)

  const { error: e3 } = await supabase
    .from('factory_rulesets')
    .insert({ factory_id: factoryId, kind, data, version: nextVersion, is_active: true, note: note ?? null })
  if (e3) throw new Error(e3.message)

  invalidateRuleset(factoryId)
  return nextVersion
}
