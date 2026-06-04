// 黑湖原始返回 → 三张宽表行。字段名以接口文档为准。

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

/** 销售订单(含明细) → 明细宽表行(订单头 + 行拼接)。 */
export function mapSalesLines(orders: Row[], tenantId: string, syncedAt: string): Row[] {
  const out: Row[] = []
  for (const o of orders) {
    const details = Array.isArray(o.saleManageOrderDetailRowApiVOList) ? o.saleManageOrderDetailRowApiVOList as Row[] : []
    for (const d of details) {
      out.push({
        id: `${o.orderNo}#${d.seq}`,
        tenant_id: tenantId,
        order_no: o.orderNo ?? null,
        seq: num(d.seq),
        status: num(o.status),
        customer_code: o.customerCode ?? null,
        order_time: o.orderTime ?? null,
        arrival_plan_time: d.arrivalPlanTime ?? o.arrivalPlanTime ?? null,
        product_code: d.productCode ?? null,
        product_name: d.productName ?? null,
        product_spec: d.productSpec ?? null,
        unit_name: d.productUnitName ?? null,
        qty: num(d.qty),
        pending_qty: num(d.pendingAmount),         // 待排产数量
        ship_qty: num(d.productShipmentQty),
        unit_price: num(d.unitPrice),
        amount: num(d.amount),
        raw: d,
        synced_at: syncedAt,
      })
    }
  }
  return out
}

/** 物料清单 → BOM 行(单层 父→子+用量)。 */
export function mapBom(rows: Row[], tenantId: string, syncedAt: string): Row[] {
  return rows.map(r => ({
    id: `${r.lastProductCode}#${r.nextProductCode}#${r.feedProcessCode ?? ''}`,
    tenant_id: tenantId,
    parent_code: r.lastProductCode ?? null,
    child_code: r.nextProductCode ?? null,
    feed_process_code: r.feedProcessCode ?? null,
    unit_qty: num(r.unitQty) ?? 1,
    remark: r.remark ?? null,
    raw: r,
    synced_at: syncedAt,
  }))
}

/** 产品列表 → 库存余额行(按产品编码,含产品字段 + stockQty 总数)。 */
export function mapInventory(products: Row[], tenantId: string, syncedAt: string): Row[] {
  return products.map(p => ({
    id: `${tenantId}#${p.productCode}`,
    tenant_id: tenantId,
    product_code: p.productCode ?? null,
    product_name: p.productName ?? null,
    product_spec: p.productSpecification ?? null,
    unit: p.unit ?? null,
    origin_type: num(p.originType),
    stock_qty: num(p.stockQty) ?? 0,
    safety_qty: num(p.safetyQty),
    raw: p,
    synced_at: syncedAt,
  }))
}
