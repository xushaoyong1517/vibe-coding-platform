import { NextResponse } from 'next/server'
import { runSync, type SyncMode } from '@/lib/blacklake/sync'

// GET /api/blacklake/cron?mode=full|incremental —— 定时任务入口（Vercel Cron 调用，仅 GET）。
//  · 每日 00:00(北京) full       ：全量对账 + 清理删除 + 刷新全部库存。
//  · 每小时        incremental  ：按 updatedAt 增量「有更新的同步」。
// 安全：设了 CRON_SECRET 时校验 Authorization: Bearer（Vercel Cron 会自动带上）。
export const maxDuration = 300

// 定时任务无登录态 → 默认租户；可用 ?tenant= 覆盖。多租户可在此改为遍历租户列表。
const DEFAULT_TENANT = process.env.BLACKLAKE_TENANT_ID || 'yuechiang'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const mode = (url.searchParams.get('mode') === 'full' ? 'full' : 'incremental') as SyncMode
  const tenantId = url.searchParams.get('tenant') || DEFAULT_TENANT
  try {
    const result = await runSync(tenantId, mode)
    return NextResponse.json({ ok: true, tenant: tenantId, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
