import { NextResponse } from 'next/server'
import { pullAllRaw } from '@/lib/blacklake/pull'
import { mapSaleOrders, mapCustomers, mapProducts, mapMaterials, mapStock } from '@/lib/blacklake/map'

// GET /api/blacklake/preview —— 「数据同步」测试页专用：直连黑湖五接口实时拉取，
// 用与落库相同的 map 投影成五张贴源表（销售订单/客户/产品/物料清单/库存余额）的行，供前端展示。
// 不落库 —— 纯粹验证接口连通与字段映射。custom 自定义字段就地平铺为顶层列（字段名即列名）。
export const maxDuration = 300

type Row = Record<string, unknown>
const STATUS: Record<string, string> = { '0': '未审批', '10': '执行中', '20': '已结束', '30': '已取消' }
const ORIGIN: Record<string, string> = { '0': '自制', '1': '外购', '2': '委外' }

// DB 行 → 展示行：剔除 raw/id/tenant_id/synced_at 与非标量系统字段(JSONB 数组如负责人)，
// custom 平铺到顶层，附加派生显示字段。表格只展示标量列。
function display(rows: Row[], opts?: { derive?: (r: Row) => Row; drop?: string[] }): Row[] {
  const drop = new Set(opts?.drop ?? [])
  return rows.map(r => {
    const { raw, id, tenant_id, synced_at, custom, ...sys } = r
    void raw; void id; void tenant_id; void synced_at
    const flat: Row = {}
    for (const [k, v] of Object.entries(sys)) { if (drop.has(k) || (v && typeof v === 'object')) continue; flat[k] = v }
    return { ...flat, ...(opts?.derive ? opts.derive(r) : null), ...(custom as Row) }
  })
}

export async function GET() {
  try {
    const { customers, products, orders, materials, stock } = await pullAllRaw()
    const T = '_'   // 仅做映射，tenant 占位不入库
    const now = new Date().toISOString()

    const sale = display(mapSaleOrders(orders, T, now), { derive: r => ({ status_label: STATUS[String(r.status)] ?? '' }) })
    const cust = display(mapCustomers(customers, T, now), { drop: ['responsible_users', 'responsible_groups'] })
    const prod = display(mapProducts(products, T, now), { derive: r => ({ origin_label: ORIGIN[String(r.origin_type)] ?? '' }) })
    const mat = display(mapMaterials(materials, T, now))
    const stk = display(mapStock(stock, T, now))

    return NextResponse.json({
      ok: true,
      syncedAt: now,
      counts: { 销售订单: sale.length, 客户: cust.length, 产品: prod.length, 物料清单: mat.length, 库存余额: stk.length },
      orders: sale, customers: cust, products: prod, materials: mat, stock: stk,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
