import { NextResponse } from 'next/server'
import { getTenantId } from '@/lib/auth'
import { loadParamUnits } from '@/lib/load-param-units'

// GET /api/param-units —— 当前租户生效的 19 单元（GLOBAL + 租户覆盖合并）
export async function GET(req: Request) {
  const tenantId = getTenantId(req)
  try {
    const units = await loadParamUnits(tenantId)
    const arr = Object.values(units).sort((a, b) => Number(a.unit.slice(1)) - Number(b.unit.slice(1)))
    return NextResponse.json({ tenant_id: tenantId, units: arr })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
