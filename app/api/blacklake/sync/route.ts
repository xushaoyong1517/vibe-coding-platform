import { NextResponse } from 'next/server'
import { getTenantId } from '@/lib/auth'
import { runSync, type SyncMode } from '@/lib/blacklake/sync'

// POST /api/blacklake/sync —— 手动触发同步。?mode=full(默认)|incremental。
export const maxDuration = 300

export async function POST(req: Request) {
  const tenantId = getTenantId(req)
  const mode = (new URL(req.url).searchParams.get('mode') === 'incremental' ? 'incremental' : 'full') as SyncMode
  try {
    const result = await runSync(tenantId, mode)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
