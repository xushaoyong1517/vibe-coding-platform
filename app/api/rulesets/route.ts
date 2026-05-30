import { NextResponse } from 'next/server'
import { loadRuleset } from '@/lib/load-ruleset'
import { getTenantId } from '@/lib/auth'

// GET /api/rulesets —— 取当前登录租户生效中的牌1/牌2（租户由会话决定）
export async function GET(req: Request) {
  const factoryId = getTenantId(req)
  try {
    const ruleset = await loadRuleset(factoryId)
    if (!ruleset) return NextResponse.json({ error: `工厂「${factoryId}」无生效规则` }, { status: 404 })
    return NextResponse.json(ruleset)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
