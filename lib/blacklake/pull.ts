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
 * BOM：materials/queryList 要求至少传一个参数 → 按父件编码逐个查。
 * 传入销售订单里出现的父件编码集合，避免全量。
 */
export async function pullBomForParents(parentCodes: string[]): Promise<Row[]> {
  const uniq = [...new Set(parentCodes.filter(Boolean))]
  const out: Row[] = []
  for (const code of uniq) {
    const rows = await pullNestedEnvelope('/api/dytin/external/materials/queryList', { lastProductCode: code })
    out.push(...rows)
  }
  return out
}
