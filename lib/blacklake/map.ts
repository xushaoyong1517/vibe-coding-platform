// 黑湖原始返回 → 五张「贴源」表行（与接口 1:1）。字段名以接口文档为准。
// 系统字段落强类型列；租户级「自定义字段」统一平铺进 custom JSONB（字段名→值，加字段零 DDL）。
// 五表：销售订单 bl_sale_orders / 客户 bl_customers / 产品 bl_products / 物料清单 bl_materials / 库存余额 bl_stock

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))
const str = (v: unknown): string => (v == null ? '' : String(v))
const txt = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const isObj = (v: unknown): v is Row => v != null && typeof v === 'object' && !Array.isArray(v)
const json = (v: unknown): unknown => (Array.isArray(v) || isObj(v) ? v : null)

// 平铺黑湖「自定义字段」：扫描形如 [{fieldName, fieldValue}] 的数组 → { 名称: 值 }（字段名即 key，不加前缀）。
// 可传多个来源对象（如明细行+订单头），后者同名 key 覆盖前者。
const CF_NAME_KEYS = ['fieldName', 'attributeName', 'customFieldName', 'name', 'label', 'fieldCode', 'code']
const CF_VAL_KEYS = ['fieldValue', 'attributeValue', 'customFieldValue', 'fieldValueName', 'valueName', 'displayValue', 'choiceValue', 'value', 'val']
export function flattenCustom(...objs: Row[]): Row {
  const out: Row = {}
  for (const obj of objs) {
    for (const v of Object.values(obj)) {
      if (!Array.isArray(v) || v.length === 0 || !isObj(v[0])) continue
      const sample = v[0] as Row
      const nk = CF_NAME_KEYS.find(k => k in sample)
      const vk = CF_VAL_KEYS.find(k => k in sample)
      if (!nk || !vk) continue
      for (const it of v) {
        if (!isObj(it)) continue
        const nm = str(it[nk])
        if (!nm) continue
        const raw = it[vk]
        out[nm] = raw == null ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : raw)
      }
    }
  }
  return out
}

// ── ① 销售订单 saleOrder/queryList → bl_sale_orders（一明细行一行：订单头系统字段 + 明细行系统字段）──
export function mapSaleOrders(orders: Row[], tenantId: string, syncedAt: string): Row[] {
  const out: Row[] = []
  for (const o of orders) {
    const details = Array.isArray(o.saleManageOrderDetailRowApiVOList) ? o.saleManageOrderDetailRowApiVOList as Row[] : []
    const rows = details.length ? details : [{}]   // 无明细的订单也留一行(头信息)
    for (const d of rows) {
      out.push({
        id: `${tenantId}#${str(o.orderNo)}#${str(d.seq) || '0'}`,
        tenant_id: tenantId,
        order_no: txt(o.orderNo),
        status: num(o.status),
        customer_code: txt(o.customerCode),
        customer_name: txt(o.customerName),
        contract_no: txt(o.contractNo),
        order_time: txt(o.orderTime),
        approved_time: txt(o.approvedTime),
        end_time: txt(o.endTime),
        seq: num(d.seq),
        product_code: txt(d.productCode),
        product_name: txt(d.productName),
        product_spec: txt(d.productSpec),
        unit_name: txt(d.productUnitName),
        qty: num(d.qty),
        pending_qty: num(d.pendingAmount),          // 待排产数量
        ship_qty: num(d.productShipmentQty),
        unit_price: num(d.unitPrice),
        amount: num(d.amount),
        arrival_plan_time: txt(d.arrivalPlanTime ?? o.arrivalPlanTime),
        custom: flattenCustom(d, o),
        raw: d,
        synced_at: syncedAt,
      })
    }
  }
  return out
}

// ── ② 客户 customer/queryList → bl_customers ──
export function mapCustomers(customers: Row[], tenantId: string, syncedAt: string): Row[] {
  return customers.map(c => ({
    id: `${tenantId}#${str(c.code)}`,
    tenant_id: tenantId,
    bl_id: num(c.id),
    code: txt(c.code),
    name: txt(c.name),
    full_name: txt(c.fullName),
    contact: txt(c.contact),
    phone: txt(c.phone),
    address: txt(c.address),
    receivable_days: num(c.receivableDays),
    responsible_users: json(c.responsibleUsers),    // 系统字段但为数组 → JSONB
    responsible_groups: json(c.responsibleGroups),
    custom: flattenCustom(c),
    raw: c,
    synced_at: syncedAt,
  }))
}

// ── ③ 产品 product/queryList → bl_products ──
export function mapProducts(products: Row[], tenantId: string, syncedAt: string): Row[] {
  return products.map(p => ({
    id: `${tenantId}#${str(p.productCode)}`,
    tenant_id: tenantId,
    product_code: txt(p.productCode),
    product_name: txt(p.productName),
    product_spec: txt(p.productSpecification),
    unit: txt(p.unit),
    origin_type: num(p.originType),                 // 0自制 1外购 2委外
    stock_qty: num(p.stockQty),
    cost_price: num(p.costPrice),
    sales_price: num(p.salesPrice),
    safety_qty: num(p.safetyQty),
    max_qty: num(p.maxQty),
    min_qty: num(p.minQty),
    process_routing_code: txt(p.prcessRoutingCode), // 文档拼写为 prcessRoutingCode
    vendor_code: txt(p.vendorCode),
    warehouse_code: txt(p.warehouseCode),
    custom: flattenCustom(p),
    raw: p,
    synced_at: syncedAt,
  }))
}

// ── ④ 物料清单 materials/queryList → bl_materials（单层 父→子 + 用量）──
export function mapMaterials(rows: Row[], tenantId: string, syncedAt: string): Row[] {
  return rows.map(r => ({
    id: `${tenantId}#${str(r.lastProductCode)}#${str(r.nextProductCode)}#${str(r.feedProcessCode)}`,
    tenant_id: tenantId,
    last_product_code: txt(r.lastProductCode),       // 父项
    next_product_code: txt(r.nextProductCode),       // 子项
    feed_process_code: txt(r.feedProcessCode),
    unit_qty: num(r.unitQty),
    remark: txt(r.remark),
    created_at: txt(r.createdAt),
    updated_at: txt(r.updatedAt),
    custom: flattenCustom(r),
    raw: r,
    synced_at: syncedAt,
  }))
}

// ── ⑤ 库存余额 stock/queryStockInfoDetail → bl_stock（产品×仓库一行）──
export function mapStock(rows: Row[], tenantId: string, syncedAt: string): Row[] {
  return rows.map(s => ({
    id: `${tenantId}#${str(s.productCode)}#${str(s.warehouseCode)}`,
    tenant_id: tenantId,
    product_id: num(s.productId),
    product_code: txt(s.productCode),
    product_name: txt(s.productName),
    warehouse_id: num(s.warehouseId),
    warehouse_code: txt(s.warehouseCode),
    warehouse_name: txt(s.warehouseName),
    qty_in_warehouse: num(s.qtyInWarehouse),
    unit_name: txt(s.unitName),
    custom: flattenCustom(s),
    raw: s,
    synced_at: syncedAt,
  }))
}
