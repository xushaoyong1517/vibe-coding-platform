'use client'

// 数据同步（测试页）—— 直连黑湖小工单接口实时拉取，三 Tab 展示：销售明细 / BOM / 库存余额。
// 客户名称、产品名称+规格 均由「客户接口 / 产品接口」就地拼接（见 /api/blacklake/preview）。
// 提供「刷新」（重新拉取）与「上次同步时间」。视觉沿用齐套工作台的表面色板。

import React, { useState, useEffect } from 'react'

const P = {
  bg: '#f5f5f0', card: '#fff', card2: '#faf9f4',
  border: '#e2e0d8', borderLt: '#f0ede6',
  ink: '#2c2c2c', ink2: '#7a7a70', ink3: '#a5a59a',
  brand: '#0e6b62', brandSoft: '#dcebe8',
  bad: '#c0392b', badBg: '#f7e0dc',
}
const MONO = "'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"
const LS_KEY = 'vq-datasync-lastsync'

const fmt = (n: number | null | undefined) => (n == null ? '' : (Math.round(n * 100) / 100).toLocaleString('en-US'))
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '尚未同步'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '尚未同步'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

interface Preview {
  ok: boolean; error?: string; syncedAt?: string; counts?: Record<string, number>
  orders: Row[]; customers: Row[]; products: Row[]; materials: Row[]; stock: Row[]
}
type Row = Record<string, unknown>
type Col = { k: string; label: string; num?: boolean; w?: number; tint?: string }

// 固定列之后，把接口返回的「自定义字段」自动补成列。自定义字段是租户级的、名称已是中文，
// 故字段名直接作列名，不加任何前缀；ID 类字段隐藏。
function withDynamicCols(preferred: Col[], rows: Row[]): Col[] {
  const known = new Set(preferred.map(c => c.k))
  const seen = new Set<string>()
  const extras: Col[] = []
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (known.has(k) || seen.has(k)) continue
      seen.add(k)
      if (/^id$/i.test(k) || /Id$|Ids$/.test(k) || /_id$|_ids$/i.test(k)) continue   // id / *Id / *_id（含 product_id、bl_id 等）
      let hasVal = false, allNum = true
      for (const rr of rows) {
        const v = rr[k]
        if (v == null || v === '') continue
        hasVal = true
        if (typeof v !== 'number') { allNum = false; break }
      }
      extras.push({ k, label: k, num: hasVal && allNum, tint: P.brand })
    }
  }
  return [...preferred, ...extras]
}

// 五个 Tab 的固定系统列（其余=租户自定义字段，由 withDynamicCols 自动补在后面）。键 = 落库列名(snake_case)。
const SALE_COLS: Col[] = [
  { k: 'order_no', label: '订单编号', w: 120 },
  { k: 'seq', label: '行号', num: true },
  { k: 'status_label', label: '状态' },
  { k: 'customer_code', label: '客户编号', w: 110 },
  { k: 'customer_name', label: '客户名称', w: 150 },
  { k: 'product_code', label: '产品编号', w: 120 },
  { k: 'product_name', label: '产品名称', w: 160 },
  { k: 'product_spec', label: '产品规格', w: 160 },
  { k: 'unit_name', label: '单位' },
  { k: 'qty', label: '订单数量', num: true },
  { k: 'pending_qty', label: '待排产', num: true },
  { k: 'unit_price', label: '单价', num: true },
  { k: 'amount', label: '金额', num: true },
  { k: 'arrival_plan_time', label: '计划交货', w: 110 },
  { k: 'order_time', label: '下单时间', w: 110 },
  { k: 'contract_no', label: '合同号' },
]
const CUST_COLS: Col[] = [
  { k: 'code', label: '客户编号', w: 120 },
  { k: 'name', label: '客户名称', w: 160 },
  { k: 'full_name', label: '客户全称', w: 200 },
  { k: 'contact', label: '联系人' },
  { k: 'phone', label: '联系电话', w: 130 },
  { k: 'address', label: '联系地址', w: 220 },
  { k: 'receivable_days', label: '收款期限', num: true },
]
const PROD_COLS: Col[] = [
  { k: 'product_code', label: '产品编号', w: 120 },
  { k: 'product_name', label: '产品名称', w: 180 },
  { k: 'product_spec', label: '产品规格', w: 180 },
  { k: 'unit', label: '单位' },
  { k: 'origin_label', label: '属性' },
  { k: 'stock_qty', label: '库存数量', num: true },
  { k: 'cost_price', label: '成本单价', num: true },
  { k: 'sales_price', label: '销售单价', num: true },
  { k: 'safety_qty', label: '安全库存', num: true },
  { k: 'max_qty', label: '最大库存', num: true },
  { k: 'min_qty', label: '最小库存', num: true },
  { k: 'process_routing_code', label: '工艺路线' },
  { k: 'vendor_code', label: '供应商编号', w: 110 },
  { k: 'warehouse_code', label: '仓库编号' },
]
const MAT_COLS: Col[] = [
  { k: 'last_product_code', label: '父项产品编号', w: 130 },
  { k: 'next_product_code', label: '子项产品编号', w: 130 },
  { k: 'feed_process_code', label: '投料工序' },
  { k: 'unit_qty', label: '单位用量', num: true },
  { k: 'remark', label: '备注', w: 160 },
  { k: 'created_at', label: '创建时间', w: 110 },
  { k: 'updated_at', label: '更新时间', w: 110 },
]
const STOCK_COLS: Col[] = [
  { k: 'product_code', label: '产品编号', w: 120 },
  { k: 'product_name', label: '产品名称', w: 200 },
  { k: 'warehouse_code', label: '仓库编号', w: 110 },
  { k: 'warehouse_name', label: '仓库名称', w: 150 },
  { k: 'qty_in_warehouse', label: '库存数量', num: true },
  { k: 'unit_name', label: '单位' },
]

type TabKey = 'orders' | 'customers' | 'products' | 'materials' | 'stock'
const TAB_DEFS: { k: TabKey; label: string; cols: Col[]; rows: (d: Preview) => Row[] }[] = [
  { k: 'orders', label: '销售订单', cols: SALE_COLS, rows: d => d.orders },
  { k: 'customers', label: '客户', cols: CUST_COLS, rows: d => d.customers },
  { k: 'products', label: '产品', cols: PROD_COLS, rows: d => d.products },
  { k: 'materials', label: '物料清单', cols: MAT_COLS, rows: d => d.materials },
  { k: 'stock', label: '库存余额', cols: STOCK_COLS, rows: d => d.stock },
]

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: P.ink2, padding: '8px 11px', background: P.card2, borderBottom: `1.5px solid ${P.border}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 }
const td: React.CSSProperties = { padding: '7px 11px', fontSize: 12.5, color: P.ink, borderBottom: `1px solid ${P.borderLt}`, verticalAlign: 'top', lineHeight: 1.5, whiteSpace: 'nowrap' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: MONO }
const code: React.CSSProperties = { fontFamily: MONO, fontSize: 12 }
const btn = (primary?: boolean): React.CSSProperties => ({ fontWeight: 600, fontSize: 12.5, padding: '8px 14px', border: `1px solid ${primary ? P.brand : P.border}`, borderRadius: 8, background: primary ? P.brand : '#fff', color: primary ? '#fff' : P.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' })

function Refresh({ s = 14 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v5h-5" /></svg>
}

type Sort = { col: string; dir: 'asc' | 'desc' } | null

// 关键词筛选(任意可见列命中) + 排序(空值恒末尾，数值列按数值，其余按中文/自然序)
function viewRows(rows: Record<string, unknown>[], cols: Col[], query: string, sort: Sort): Record<string, unknown>[] {
  let out = rows
  const q = query.trim().toLowerCase()
  if (q) {
    const keys = cols.map(c => c.k)
    out = out.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(q)))
  }
  if (sort) {
    const num = cols.find(c => c.k === sort.col)?.num
    out = [...out].sort((a, b) => {
      const va = a[sort.col], vb = b[sort.col]
      const ea = va == null || va === '', eb = vb == null || vb === ''
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1            // 空值恒排末尾
      const r = num ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), 'zh-Hans-CN', { numeric: true })
      return sort.dir === 'asc' ? r : -r
    })
  }
  return out
}

function Table({ cols, rows, sort, onSort }: { cols: Col[]; rows: Record<string, unknown>[]; sort?: Sort; onSort?: (k: string) => void }) {
  return (
    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map(c => {
          const active = sort?.col === c.k
          return (
            <th key={c.k} title={`${c.label}（点击排序）`} onClick={() => onSort?.(c.k)}
              style={{ ...th, ...(c.num ? { textAlign: 'right' } : null), ...(c.w ? { minWidth: c.w } : null), ...(c.tint ? { color: c.tint } : null), cursor: onSort ? 'pointer' : 'default', userSelect: 'none', color: active ? P.brand : (c.tint ?? P.ink2) }}>
              {c.label}<span style={{ fontSize: 9, marginLeft: 3, opacity: active ? 1 : 0.25 }}>{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
            </th>
          )
        })}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#fbfbf8' : '#fff' }}>
              {cols.map(c => {
                const v = r[c.k]
                return <td key={c.k} style={c.num ? tdNum : td}>{c.num ? fmt(v as number | null) : (v == null || v === '' ? <span style={{ color: P.ink3 }}>—</span> : String(v))}</td>
              })}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} style={{ ...td, textAlign: 'center', color: P.ink3, padding: 40 }}>暂无数据</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function PageDataSync() {
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('orders')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>(null)

  useEffect(() => { setLastSync(localStorage.getItem(LS_KEY)) }, [])

  // 切 Tab 重置排序/筛选（各表列不同）
  const changeTab = (k: TabKey) => { setTab(k); setSort(null); setQuery('') }
  // 点列头：升→降→取消
  const onSort = (k: string) => setSort(s => (s && s.col === k ? (s.dir === 'asc' ? { col: k, dir: 'desc' } : null) : { col: k, dir: 'asc' }))

  const load = () => {
    setLoading(true); setError(null)
    fetch('/api/blacklake/preview')
      .then(r => r.json())
      .then((d: Preview) => {
        if (!d.ok) throw new Error(d.error || '拉取失败')
        setData(d)
        const t = d.syncedAt || new Date().toISOString()
        setLastSync(t); localStorage.setItem(LS_KEY, t)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  const def = TAB_DEFS.find(t => t.k === tab)!

  return (
    <div style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
      {/* 标题 + 操作行 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>数据同步 <span style={{ fontSize: 12, fontWeight: 600, color: P.ink3, background: P.card2, border: `1px solid ${P.border}`, borderRadius: 6, padding: '2px 8px' }}>测试</span></h1>
        <div style={{ flex: 1 }} />
        <span title="本浏览器上次成功从黑湖接口拉取数据的时间" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: '5px 12px', fontFamily: MONO, fontSize: 11, color: P.ink2 }}>
          上次同步 <b style={{ color: P.brand }}>{fmtDateTime(lastSync)}</b>
        </span>
        <button style={{ ...btn(true), opacity: loading ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }} onClick={load} disabled={loading}>
          <Refresh />{loading ? '拉取中…' : '刷新'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: P.ink2, marginBottom: 14 }}>
        点「刷新」直连黑湖五接口（销售订单/客户/产品/物料清单/库存余额）实时拉取，与落库同一套字段映射。系统字段为固定列，固定列之后追加本租户的<span style={{ color: P.brand }}>自定义字段</span>（字段名即列名）。
        {data?.counts && <span style={{ marginLeft: 8, color: P.ink3 }}>· 销售订单 {data.counts.销售订单} / 客户 {data.counts.客户} / 产品 {data.counts.产品} / 物料清单 {data.counts.物料清单} / 库存余额 {data.counts.库存余额}</span>}
      </div>

      {error && <div style={{ background: P.badBg, color: P.bad, border: `1px solid ${P.bad}33`, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>拉取失败：{error}</div>}

      {!data && !loading && !error && (
        <div style={{ background: P.card, border: `1px dashed ${P.border}`, borderRadius: 10, padding: 50, textAlign: 'center', color: P.ink2 }}>
          点右上角「刷新」从黑湖小工单接口拉取数据。
        </div>
      )}
      {loading && !data && <div style={{ padding: 50, textAlign: 'center', color: P.ink2 }}>从黑湖接口拉取数据中…</div>}

      {data && (() => {
        const allRows = def.rows(data)
        const cols = withDynamicCols(def.cols, allRows)
        const view = viewRows(allRows, cols, query, sort)
        return (
          <>
            {/* Tab 切换 + 关键词筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {TAB_DEFS.map(t => {
                const on = tab === t.k
                const n = t.rows(data).length
                return (
                  <div key={t.k} onClick={() => changeTab(t.k)} style={{ fontWeight: 700, fontSize: 13, padding: '8px 16px', border: `1px solid ${on ? P.brand : P.border}`, borderRadius: 9, cursor: 'pointer', color: on ? '#f1ebdd' : P.ink2, background: on ? P.brand : P.card, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {t.label}<span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 20, background: on ? '#ffffff22' : P.card2, color: on ? '#f1ebdd' : P.ink3 }}>{n}</span>
                  </div>
                )
              })}
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.card, border: `1px solid ${P.border}`, borderRadius: 8, padding: '6px 11px', width: 240 }}>
                <span style={{ color: P.ink3, fontSize: 13 }}>🔍</span>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="筛选当前表（任意列）"
                  style={{ border: 0, background: 'transparent', outline: 'none', fontSize: 12.5, flex: 1, minWidth: 0, fontFamily: 'inherit', color: P.ink }} />
                {query && <span onClick={() => setQuery('')} style={{ cursor: 'pointer', color: P.ink3, fontSize: 14, lineHeight: 1 }} title="清除">×</span>}
              </div>
            </div>

            {/* 行数 / 排序提示 */}
            <div style={{ fontSize: 11.5, color: P.ink3, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{query ? `筛选后 ${view.length} / 共 ${allRows.length} 行` : `共 ${allRows.length} 行`}</span>
              {sort && <span>· 按「{cols.find(c => c.k === sort.col)?.label}」{sort.dir === 'asc' ? '升序' : '降序'} <span onClick={() => setSort(null)} style={{ cursor: 'pointer', color: P.brand, textDecoration: 'underline' }}>清除</span></span>}
              <span style={{ color: P.ink3, opacity: 0.7 }}>· 点列头排序</span>
            </div>

            <Table cols={cols} rows={view} sort={sort} onSort={onSort} />
          </>
        )
      })()}
    </div>
  )
}
