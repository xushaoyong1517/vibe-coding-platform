import { NextResponse } from 'next/server'
import { normalizeImport, activateNewVersion } from '@/lib/ruleset-write'
import { getTenantId } from '@/lib/auth'

// POST /api/rulesets/import
// body: { factory_id?, note?, ...规则数据 }
//   规则数据支持：{ pai1, pai2 } | 规范JSON { pai1_body_material:{families}, pai2_internals:{map} } | { families } | { map }
// 行为：把提供的牌1/牌2各写为新版本并激活（旧版本自动停用），清缓存。
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const factoryId = getTenantId(req)  // 租户由会话决定，不信任 body
  const note = body.note ? String(body.note) : undefined

  let pai1, pai2
  try {
    ({ pai1, pai2 } = normalizeImport(body))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  try {
    const result: Record<string, number> = {}
    if (pai1) result.pai1_version = await activateNewVersion(factoryId, 'pai1_body_material', pai1, note)
    if (pai2) result.pai2_version = await activateNewVersion(factoryId, 'pai2_internals', pai2, note)
    return NextResponse.json({
      ok: true,
      factory_id: factoryId,
      ...result,
      pai1_families: pai1 ? Object.keys(pai1).length : 0,
      pai2_trims: pai2 ? Object.keys(pai2).length : 0,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
