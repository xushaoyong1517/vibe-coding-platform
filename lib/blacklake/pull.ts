import { blFetch } from './client.ts'

// 三个数据源的分页抓取。注意两种分页信封：
//  · saleOrder/queryList2 : 顶层 page.total，data 直接是列表
//  · product/queryList2 / materials/queryList : data = { data:[], pageNum, pageSize, total }

const PAGE_SIZE = 100   // 文档上限 100

type Row = Record<string, unknown>

/** 顶层 page 信封（销售订单）：data 为列表，total 在 resp.page。 */
async function pullTopEnvelope(path: string, baseBody: Row): Promise<Row[]> {
  const out: Row[] = []
  for (let pageNum = 1; ; pageNum++) {
    const resp = await blFetch<Row[]>(path, { ...baseBody, page: { pageNum, pageSize: PAGE_SIZE } })
    const list = Array.isArray(resp.data) ? resp.data : []
    out.push(...list)
    const total = resp.page?.total ?? out.length
    if (out.length >= total || list.length === 0) break
  }
  return out
}

/** 嵌套 data 信封（产品/BOM）：data = { data:[], total }。 */
async function pullNestedEnvelope(path: string, baseBody: Row): Promise<Row[]> {
  const out: Row[] = []
  for (let pageNum = 1; ; pageNum++) {
    const resp = await blFetch<{ data?: Row[]; total?: number }>(path, { ...baseBody, page: { pageNum, pageSize: PAGE_SIZE } })
    const list = Array.isArray(resp.data?.data) ? resp.data!.data! : []
    out.push(...list)
    const total = resp.data?.total ?? out.length
    if (out.length >= total || list.length === 0) break
  }
  return out
}

/** 销售订单（含明细行）。默认拉"未审批+执行中"(需生产的)。 */
export function pullSalesOrders(opts?: { status?: number[]; updatedAtGte?: string }): Promise<Row[]> {
  const body: Row = { status: opts?.status ?? [0, 10] }
  if (opts?.updatedAtGte) body.updatedAtGte = opts.updatedAtGte
  return pullTopEnvelope('/api/dytin/external/saleOrder/queryList2', body)
}

/** 产品列表（含 stockQty 库存总数）。 */
export function pullProducts(opts?: { updatedAtStart?: string }): Promise<Row[]> {
  const body: Row = {}
  if (opts?.updatedAtStart) body.updatedAtStart = opts.updatedAtStart
  return pullNestedEnvelope('/api/dytin/external/product/queryList2', body)
}

/**
 * 客户列表。客户接口「请求参数不支持全部为空」→ 传一个极早的创建起始时间兜底全量。
 * 返回信封不确定（文档 page 在顶层，但产品接口同样文档却是嵌套）→ 自动识别两种形态。
 */
export async function pullCustomers(opts?: { updatedAtStart?: string }): Promise<Row[]> {
  const out: Row[] = []
  // 增量：按更新时间起点；全量：用极早创建时间兜底（接口要求参数不可全空）。
  const base: Row = opts?.updatedAtStart ? { updatedAtStart: opts.updatedAtStart } : { createdAtStart: '2000-01-01 00:00:00' }
  for (let pageNum = 1; ; pageNum++) {
    const resp = await blFetch<unknown>('/api/dytin/external/customer/queryList', { ...base, page: { pageNum, pageSize: PAGE_SIZE } })
    // 顶层信封：data 直接是数组；嵌套信封：data = { data:[], total }
    const top = Array.isArray(resp.data) ? (resp.data as Row[]) : null
    const nested = !top && resp.data && Array.isArray((resp.data as { data?: Row[] }).data) ? (resp.data as { data: Row[] }).data : null
    const list = top ?? nested ?? []
    out.push(...list)
    const total = top ? (resp.page?.total ?? out.length) : ((resp.data as { total?: number })?.total ?? out.length)
    if (out.length >= total || list.length === 0) break
  }
  return out
}

/**
 * 物料清单 BOM：materials/queryList 要求至少传一个参数 → 用 updatedAtGte 兜底（全量给极早时间）。
 * 增量时传真实水位，单次查询即可拿到「更新过的」BOM 行（分页）。
 */
export async function pullMaterials(opts?: { updatedAtGte?: string }): Promise<Row[]> {
  return pullNestedEnvelope('/api/dytin/external/materials/queryList', {
    updatedAtGte: opts?.updatedAtGte ?? '2000-01-01 00:00:00',
  })
}

/**
 * 库存余额明细 stock/queryStockInfoDetail：按「产品+仓库」组合批量查，单次≤100。
 * 组合来自产品列表（每个产品带 warehouseCode）→ 拿到各产品默认仓库的现存余额。
 */
const str = (v: unknown): string => (v == null ? '' : String(v))

/**
 * 库存余额明细 stock/queryStockInfoDetail：按「产品+仓库」组合批量查，单次≤100。
 * 该接口强制要求仓库（编号或 id），二者皆空会报错。
 * 只查 pairs 中带 warehouseCode 的组合；无仓库的产品由 pullAllRaw 回落到产品 stockQty。
 */
export async function pullStock(pairs: { productCode: string; warehouseCode: string }[]): Promise<Row[]> {
  const valid = pairs.filter(p => p.productCode && p.warehouseCode)
  const out: Row[] = []
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100)
    const resp = await blFetch<Row[]>('/api/dytin/external/stock/queryStockInfoDetail', {
      stockInfoQryOpenApiCOList: chunk.map(p => ({ productCode: p.productCode, warehouseCode: p.warehouseCode })),
    })
    if (Array.isArray(resp.data)) out.push(...resp.data)
  }
  return out
}

/**
 * 回落库存：产品列表本身带 stockQty（产品级现存总数，不分仓）。
 * 当产品没有 warehouseCode（库存明细接口无法调用）时，用它兜底成「库存余额」行，
 * 字段对齐 stock 接口（warehouse 留空表示未分仓）。
 */
export function stockFromProducts(products: Row[]): Row[] {
  return products
    .filter(p => p.productCode != null && p.stockQty != null)
    .map(p => ({
      productId: p.id ?? null,
      productCode: p.productCode,
      productName: p.productName,
      warehouseCode: null,
      warehouseName: null,
      qtyInWarehouse: p.stockQty,
      unitName: p.unit,
    }))
}

/**
 * 一次拉齐五源（销售订单 / 客户 / 产品 / 物料清单 / 库存余额），供同步与测试页预览共用。
 * 传 updatedSince(格式 'yyyy-MM-dd HH:mm:ss', 黑湖服务器本地时区) → 增量「有更新的同步」；
 * 不传 → 全量。库存接口无时间过滤，随产品回落（增量时仅覆盖有变更的产品）。
 */
export async function pullAllRaw(opts?: { saleStatus?: number[]; updatedSince?: string }) {
  const since = opts?.updatedSince
  const [customers, products, orders] = await Promise.all([
    pullCustomers({ updatedAtStart: since }),
    pullProducts({ updatedAtStart: since }),
    pullSalesOrders({ status: opts?.saleStatus ?? [0, 10, 20], updatedAtGte: since }),
  ])
  const materials = await pullMaterials({ updatedAtGte: since })
  // 库存：优先真·明细接口（需仓库）；产品无仓库 → 回落产品 stockQty（产品级，未分仓）
  const real = await pullStock(products.map(p => ({ productCode: str(p.productCode), warehouseCode: str(p.warehouseCode) })))
  const stock = real.length ? real : stockFromProducts(products)
  return { customers, products, orders, materials, stock }
}
