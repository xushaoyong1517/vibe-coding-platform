'use client'

// 齐套分析工作台 —— 三视图：按订单齐套 / 缺料采购 / 按客户。
// 数据来自 GET /api/blacklake/kitting（黑湖三张宽表 → buildWorkbench 派生）。
// 视觉沿用宿主应用的表面色 + 一套语义色（齐套绿/部分琥珀/全缺红/在途青）。

import React, { useState, useMemo, useEffect } from 'react'
import type { WorkbenchData, WbLine } from '@/lib/kitting-workbench'

// ── 调色板（表面取宿主 token，语义色保留功能编码）──
const P = {
  bg: '#f5f5f0', card: '#fff', card2: '#faf9f4',
  border: '#e2e0d8', borderLt: '#f0ede6',
  ink: '#2c2c2c', ink2: '#7a7a70', ink3: '#a5a59a',
  brand: '#0e6b62', brand2: '#0a514a', brandSoft: '#dcebe8',
  ok: '#2a7a4b', okBg: '#e6f1ea', okSoft: '#cfe4d6',
  warn: '#b07d10', warnBg: '#f7eed6', warnSoft: '#ecd9a8',
  bad: '#c0392b', badBg: '#f7e0dc', badSoft: '#edc3bb',
  gray: '#7a7a70', grayBg: '#ececea',
  gold: '#b8862a',
}
const MONO = "'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"

const fmt = (n: number | null | undefined) => {
  if (n === 0 || n == null) return '0'
  const v = Math.round(n * 100) / 100
  return v.toLocaleString('en-US')
}
const today = () => new Date().toISOString().slice(0, 10)
// ISO → 本地「YYYY-MM-DD HH:mm:ss」（同步时间展示用，含时分秒）
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '尚未同步'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '尚未同步'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = '﻿' + rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = name; a.click()
}

const STMAP: Record<string, { c: string; bg: string }> = {
  '齐套': { c: P.ok, bg: P.okBg },
  '部分齐套': { c: P.warn, bg: P.warnBg },
  '全缺': { c: P.bad, bg: P.badBg },
  '无BOM': { c: P.gray, bg: P.grayBg },
}
const rateColor = (r: number) => (r >= 100 ? P.ok : r >= 50 ? P.warn : P.bad)

type Drill = { tab: string; code?: string; customer?: string; fam?: string; cal?: string; label: string } | null

// ── 图标 ─────────────────────────────────────────────────
function Icon({ n, s = 15 }: { n: string; s?: number }) {
  const p: React.SVGProps<SVGSVGElement> = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths: Record<string, React.ReactNode> = {
    orders: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 4v16" /></>,
    cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L21 7H6" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 4.5a3.2 3.2 0 0 1 0 7M21 20c0-3-1.6-4.7-4-5" /></>,
    truck: <><rect x="1" y="6" width="13" height="10" rx="1" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
    refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v5h-5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.4 2.4 0 0 1 4.7.6c0 1.6-2.3 2-2.3 3.4" /><path d="M12 17h.01" /></>,
    close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  }
  return <svg {...p}>{paths[n]}</svg>
}

// ── 小组件 ───────────────────────────────────────────────
function Badge({ children, c, bg }: { children: React.ReactNode; c: string; bg: string }) {
  return <span style={{ fontWeight: 700, fontSize: 11, padding: '3px 9px', borderRadius: 6, background: bg, color: c, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{children}
  </span>
}
function StatusBadge({ status }: { status: string }) {
  const m = STMAP[status] ?? STMAP['无BOM']
  return <Badge c={m.c} bg={m.bg}>{status}</Badge>
}
function TransitBadge() { return <Badge c={P.brand} bg={P.brandSoft}>在途可齐</Badge> }
function Chip({ children, kind }: { children: React.ReactNode; kind: 'fam' | 'cal' }) {
  const st = kind === 'fam'
    ? { background: P.brandSoft, color: P.brand, border: `1px solid #c5dcd7` }
    : { background: '#eee9db', color: '#6a5a3a', border: '1px solid #e0d7c0' }
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: MONO, fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', ...st }}>{children}</span>
}
function RateBar({ rate, transit }: { rate: number; transit?: boolean }) {
  const c = rateColor(rate)
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 78, height: 8, borderRadius: 4, background: P.grayBg, overflow: 'hidden', position: 'relative', display: 'inline-block' }}>
      <i style={{ display: 'block', height: '100%', width: rate + '%', background: c, borderRadius: 4 }} />
      {transit && rate < 100 && <i style={{ display: 'block', height: '100%', width: (100 - rate) + '%', marginTop: -8, marginLeft: rate + '%', background: `repeating-linear-gradient(45deg,${P.brand},${P.brand} 3px,#2c6f74 3px,#2c6f74 6px)`, opacity: 0.55 }} />}
    </span>
    <b style={{ fontFamily: MONO, fontSize: 12, color: c }}>{rate}%</b>
  </span>
}
function PriorityPips({ l }: { l: WbLine }) {
  let lvl = 0
  if (l.status === '齐套') lvl = l.urgency === 'high' ? 4 : 3
  else if (l.transitKit) lvl = 3
  else if (l.status === '部分齐套') lvl = l.rate >= 50 ? 2 : 1
  else lvl = l.urgency === 'high' ? 1 : 0
  const col = ['', P.bad, P.warn, P.gold, P.okSoft][lvl]
  return <span style={{ display: 'inline-flex', gap: 2 }} title={'优先度 ' + lvl + '/4'}>
    {[0, 1, 2, 3].map(i => <span key={i} style={{ width: 5, height: 13, borderRadius: 1.5, background: i < lvl ? col : P.border }} />)}
  </span>
}
function DueChip({ l }: { l: WbLine }) {
  if (!l.due) return <span style={{ color: P.ink3, fontSize: 11 }}>未填</span>
  const col = l.urgency === 'high' ? P.bad : l.urgency === 'mid' ? P.warn : P.ink
  const lab = l.dleft == null ? '' : l.dleft < 0 ? `逾期 ${-l.dleft}天` : `还有 ${l.dleft}天`
  return <span style={{ display: 'inline-flex', flexDirection: 'column', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.25 }}>
    <span style={{ fontWeight: 600, color: col }}>{l.due}</span>
    <span style={{ fontSize: 9.5, color: P.ink3 }}>{lab}</span>
  </span>
}
function CoverageBar({ avail, intransit, net }: { avail: number; intransit: number; net: number }) {
  const a = Math.max(0, avail)
  const total = Math.max(a + net, 1)
  const segs = [
    { w: a / total * 100, c: P.ok, t: '可用 ' + fmt(a) },
    { w: Math.min(intransit, net) / total * 100, c: P.brand, t: '在途 ' + fmt(intransit) },
    { w: Math.max(0, net - intransit) / total * 100, c: P.bad, t: '待采购 ' + fmt(Math.max(0, net - intransit)) },
  ]
  return <span style={{ display: 'inline-flex', width: 120, height: 9, borderRadius: 5, background: P.grayBg, overflow: 'hidden' }}>
    {segs.map((s, i) => s.w > 0 && <i key={i} title={s.t} style={{ height: '100%', width: s.w + '%', background: s.c }} />)}
  </span>
}

// ── 通用表格样式 ──────────────────────────────────────────
const thBase: React.CSSProperties = { fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: P.ink2, textAlign: 'left', padding: '11px 12px', borderBottom: `1.5px solid ${P.border}`, whiteSpace: 'nowrap', background: P.card2, position: 'sticky', top: 0, zIndex: 2, userSelect: 'none' }
const tdBase: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const numStyle: React.CSSProperties = { fontFamily: MONO, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const codeStyle: React.CSSProperties = { fontFamily: MONO, fontSize: 12, fontWeight: 500 }
const panel: React.CSSProperties = { background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(26,25,22,.03)' }
const btn = (primary?: boolean): React.CSSProperties => ({ fontWeight: 600, fontSize: 12, padding: '8px 13px', border: `1px solid ${primary ? P.brand : P.border}`, borderRadius: 8, background: primary ? P.brand : '#fff', color: primary ? '#fff' : P.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' })
const drillBar = (label: string, onClear: () => void) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: P.brandSoft, border: '1px solid #c5dcd7', borderRadius: 9, padding: '8px 13px', marginBottom: 12, fontSize: 12.5, color: P.brand2 }}>
    <Icon n="arrow" s={15} /><span>钻取视图 · {label}</span>
    <span onClick={onClear} style={{ marginLeft: 'auto', cursor: 'pointer', border: '1px solid #aacac3', background: '#fff', color: P.brand, borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>清除 ✕</span>
  </div>
)
function SortTh({ k, label, sort, setSort, num, defDesc }: { k: string; label: string; sort: { k: string; dir: number }; setSort: (f: (s: { k: string; dir: number }) => { k: string; dir: number }) => void; num?: boolean; defDesc?: boolean }) {
  return <th style={{ ...thBase, textAlign: num ? 'right' : 'left', cursor: 'pointer' }}
    onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : (defDesc ? -1 : 1) }))}>
    {label} <span style={{ opacity: 0.4, fontSize: 9 }}>{sort.k === k ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</span>
  </th>
}

// ════════════════ 视图 1：按订单齐套 ════════════════
function OrdersView({ K, drill, clearDrill, sel, setSel, setDrill }: { K: WorkbenchData; drill: Drill; clearDrill: () => void; sel: Set<number>; setSel: React.Dispatch<React.SetStateAction<Set<number>>>; setDrill: (d: Drill) => void }) {
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ k: 'priority', dir: -1 })
  const [onlyKit, setOnlyKit] = useState(false)
  const [open, setOpen] = useState<Set<number>>(() => new Set())

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: K.lines.length }
    for (const s of ['齐套', '部分齐套', '全缺', '无BOM']) c[s] = K.lines.filter(l => l.status === s).length
    return c
  }, [K])

  const rows = useMemo(() => {
    let arr = K.lines.filter(l => {
      if (status !== 'all' && l.status !== status) return false
      if (onlyKit && l.status !== '齐套') return false
      if (drill && drill.tab === 'orders') {
        if (drill.code && !l.comp.some(c => c.code === drill.code && c.gap > 0)) return false
        if (drill.customer && l.customer !== drill.customer) return false
        if (drill.fam && (l.family !== drill.fam || l.caliber !== drill.cal)) return false
      }
      if (q) { const hay = (l.order + l.customer + l.pcode + l.pspec + l.family + l.caliber).toLowerCase(); if (!hay.includes(q.toLowerCase())) return false }
      return true
    })
    const { k, dir } = sort
    arr = [...arr].sort((a, b) => {
      let x: number | string = (a as any)[k], y: number | string = (b as any)[k]
      if (k === 'due') { x = a.dleft == null ? 1e9 : a.dleft; y = b.dleft == null ? 1e9 : b.dleft }
      if (typeof x === 'string') { x = x || ''; y = (y as string) || ''; return x < y ? -dir : x > y ? dir : 0 }
      return (((x as number) || 0) - ((y as number) || 0)) * dir
    })
    return arr
  }, [K, status, q, sort, onlyKit, drill])

  const toggle = (id: number) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pick = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const exportPlan = () => {
    const ids = sel.size ? [...sel] : K.lines.filter(l => l.status === '齐套').map(l => l._id)
    if (!ids.length) { alert('暂无可生产（齐套）订单'); return }
    const rs: (string | number)[][] = [['订单编号', '客户', '产品编码', '产品族', '口径', '规格', '交货日期', '未清数量', '成品库存', '齐套状态']]
    ids.map(i => K.lines[i]).forEach(l => rs.push([l.order, l.customer, l.pcode, l.family, l.caliber, l.pspec, l.due ?? '', l.openq, l.fg_stock, l.status]))
    downloadCsv('生产清单_' + today() + '.csv', rs)
  }

  const segs: [string, string, string | null][] = [['all', '全部', null], ['齐套', '齐套', P.ok], ['部分齐套', '部分', P.warn], ['全缺', '全缺', P.bad], ['无BOM', '无BOM', P.gray]]

  return (
    <div>
      {drill && drill.tab === 'orders' && drillBar(drill.label, clearDrill)}
      <Toolbar>
        <Seg>{segs.map(([s, lab, c]) => (
          <SegBtn key={s} on={status === s} onClick={() => setStatus(s)}>
            {c && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, background: c }} />}{lab}<span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7, marginLeft: 5 }}>{counts[s] ?? 0}</span>
          </SegBtn>
        ))}</Seg>
        <Search value={q} onChange={setQ} placeholder="搜索 订单号 / 客户 / 产品 / 规格 / 口径…" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, color: P.ink2 }}>
          <input type="checkbox" checked={onlyKit} onChange={e => setOnlyKit(e.target.checked)} style={{ accentColor: P.brand }} /> 仅看可生产
        </label>
        <button style={btn()} onClick={exportPlan}><Icon n="download" s={14} />导出生产清单</button>
      </Toolbar>

      <div style={{ ...panel, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...thBase, width: 32 }} />
            <th style={{ ...thBase, width: 34, textAlign: 'center' }} title="勾选生产">生产</th>
            <SortTh k="priority" label="优先" sort={sort} setSort={setSort} defDesc />
            <SortTh k="status" label="状态" sort={sort} setSort={setSort} />
            <SortTh k="order" label="订单编号" sort={sort} setSort={setSort} />
            <SortTh k="customer" label="客户" sort={sort} setSort={setSort} />
            <SortTh k="pcode" label="产品编码" sort={sort} setSort={setSort} />
            <th style={thBase}>产品族 / 口径</th>
            <th style={thBase}>规格</th>
            <SortTh k="due" label="交货日期" sort={sort} setSort={setSort} />
            <SortTh k="openq" label="未清" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="fg_stock" label="成品库存" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="rate" label="齐套率" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="short_items" label="缺料项" sort={sort} setSort={setSort} num defDesc />
          </tr></thead>
          <tbody>
            {rows.map(l => {
              const isOpen = open.has(l._id), canKit = l.status === '齐套'
              return <React.Fragment key={l._id}>
                <tr style={{ borderBottom: `1px solid ${P.borderLt}`, background: sel.has(l._id) ? P.brandSoft : undefined }}>
                  <td style={tdBase}><span onClick={() => toggle(l._id)} style={{ width: 19, height: 19, border: `1px solid ${isOpen ? P.ink : P.border}`, borderRadius: 5, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', fontFamily: MONO, fontSize: 13, color: isOpen ? '#fff' : P.ink2, background: isOpen ? P.ink : '#fff' }}>{isOpen ? '−' : '+'}</span></td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>{canKit ? <input type="checkbox" checked={sel.has(l._id)} onChange={() => pick(l._id)} style={{ accentColor: P.brand }} /> : <span style={{ color: P.ink3, fontSize: 11 }} title="未齐套，暂不可生产">—</span>}</td>
                  <td style={{ ...tdBase, textAlign: 'center' }}><PriorityPips l={l} /></td>
                  <td style={tdBase}><StatusBadge status={l.status} />{l.transitKit && l.status !== '齐套' && <span style={{ marginLeft: 5 }} title={'在途到货后可齐套 ' + (l.kitEta ?? '')}><TransitBadge /></span>}</td>
                  <td style={{ ...tdBase, ...codeStyle }}>{l.order}</td>
                  <td style={{ ...tdBase, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.customer}>{l.customer}</td>
                  <td style={{ ...tdBase, ...codeStyle }}>{l.pcode}</td>
                  <td style={{ ...tdBase, whiteSpace: 'nowrap' }}><Chip kind="fam">{l.family}</Chip> <Chip kind="cal">{l.caliber}</Chip></td>
                  <td style={{ ...tdBase, color: P.ink2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={l.pspec}>{l.pspec || '—'}</td>
                  <td style={tdBase}><DueChip l={l} /></td>
                  <td style={{ ...tdBase, ...numStyle }}>{fmt(l.openq)}</td>
                  <td style={{ ...tdBase, ...numStyle, color: P.ink2 }}>{fmt(l.fg_stock)}</td>
                  <td style={{ ...tdBase, ...numStyle }}>{l.has_bom ? <RateBar rate={l.rate} transit={l.transitKit} /> : <span style={{ color: P.ink3, fontSize: 11 }}>—</span>}</td>
                  <td style={{ ...tdBase, ...numStyle }}>{l.has_bom ? (l.short_items > 0 ? <span><b style={{ color: P.bad }}>{l.short_items}</b><span style={{ color: P.ink3 }}>/{l.total_items}</span></span> : <span style={{ color: P.ink2 }}>0/{l.total_items}</span>) : <span style={{ fontSize: 10, fontFamily: MONO, padding: '1px 6px', borderRadius: 5, background: P.grayBg, color: P.gray }}>无BOM</span>}</td>
                </tr>
                {isOpen && <DetailRow l={l} setDrill={setDrill} />}
              </React.Fragment>
            })}
          </tbody>
        </table>
        {!rows.length && <Empty big="没有匹配的订单" sub="试试调整筛选或搜索条件" />}
      </div>
      <Note>显示 <b>{rows.length}</b> / {K.lines.length} 行 · 优先度 = 可生产 + 交期紧迫 + 未清量 综合 · 齐套率 = 满足子件数 / 子件总数（斜纹叠加 = 在途到货后可补足）· 可用 = 提交时分到的库存</Note>
    </div>
  )
}

function DetailRow({ l, setDrill }: { l: WbLine; setDrill: (d: Drill) => void }) {
  if (!l.has_bom) return <tr><td colSpan={14} style={{ padding: 0, background: '#fff', borderBottom: `1px solid ${P.border}` }}><div style={{ padding: '12px 16px 16px 48px', color: P.ink2, fontSize: 12 }}>该产品（{l.pcode}）在 BOM 表中未找到一级子件，无法进行齐套判断，请先维护 BOM。</div></td></tr>
  const subTh: React.CSSProperties = { fontSize: 10, padding: '7px 10px', background: '#f1ece0', textAlign: 'left', color: P.ink2, fontWeight: 700 }
  const subTd: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #efeadd', fontSize: 12 }
  return <tr><td colSpan={14} style={{ padding: 0, background: '#fff', borderBottom: `1px solid ${P.border}` }}>
    <div style={{ padding: '8px 16px 18px 48px', background: 'linear-gradient(180deg,#fcfbf7,#fff)' }}>
      <h4 style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: P.ink2, margin: '13px 0 8px' }}>
        子件明细 · {l.comp.length} 项 {l.short_items > 0
          ? <span style={{ color: P.bad }}>· 缺 {l.short_items} 项{l.transitKit ? <span style={{ color: P.brand }}> · 在途到货后可齐套（{l.kitEta}）</span> : ''}</span>
          : <span style={{ color: P.ok }}>· 全部充足</span>}
      </h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          {['子件编码', '名称', '规格', '属性'].map(h => <th key={h} style={subTh}>{h}</th>)}
          {['用量', '需求', '本单可分配', '现存库存', '在途可补', '缺口'].map(h => <th key={h} style={{ ...subTh, textAlign: 'right' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {l.comp.map((c, i) => {
            const covered = c.gap > 0 && c._afterGap === 0
            const bg = c._afterGap > 0 ? P.badBg : covered ? P.brandSoft : undefined
            const fg = c._afterGap > 0 ? P.bad : covered ? P.brand : P.ink
            return <tr key={i} style={{ background: bg }}>
              <td style={{ ...subTd, ...codeStyle, color: fg }}><span onClick={() => setDrill({ tab: 'orders', code: c.code, label: '缺料 ' + c.code + '（' + (c.name || '') + '）影响的订单' })} style={{ color: P.brand, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }} title="查看受该料影响的所有订单">{c.code}</span></td>
              <td style={{ ...subTd, color: fg }}>{c.name}</td>
              <td style={{ ...subTd, color: P.ink2, fontSize: 11 }}>{c.spec}</td>
              <td style={{ ...subTd, color: c.attr === '自制' ? P.brand : P.warn, fontWeight: c.attr === '自制' ? 600 : 400 }}>{c.attr}</td>
              <td style={{ ...subTd, ...numStyle }}>{fmt(c.usage)}</td>
              <td style={{ ...subTd, ...numStyle }}>{fmt(c.need)}</td>
              <td style={{ ...subTd, ...numStyle }}>{fmt(c.alloc)}</td>
              <td style={{ ...subTd, ...numStyle, color: P.ink2 }}>{fmt(c.onhand)}</td>
              <td style={{ ...subTd, ...numStyle }}>{c._transitCover > 0 ? <b style={{ color: P.brand }}>{fmt(c._transitCover)}</b> : <span style={{ color: P.ink3 }}>0</span>}</td>
              <td style={{ ...subTd, ...numStyle }}><b style={{ color: c._afterGap > 0 ? P.bad : P.ok }}>{c._afterGap > 0 ? fmt(c._afterGap) : 0}</b></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </td></tr>
}

// ════════════════ 视图 2：缺料采购 ════════════════
function ShortageView({ K, drill, clearDrill, setDrill }: { K: WorkbenchData; drill: Drill; clearDrill: () => void; setDrill: (d: Drill) => void }) {
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('all')
  const [sort, setSort] = useState({ k: 'orders', dir: -1 })
  const counts = useMemo(() => ({
    all: K.shortage.length,
    buy: K.shortage.filter(s => s.afterNet > 0).length,
    transit: K.shortage.filter(s => s.intransit > 0).length,
    covered: K.shortage.filter(s => s.intransit > 0 && s.afterNet === 0).length,
  }), [K])
  const rows = useMemo(() => {
    let arr = K.shortage.filter(s => {
      if (seg === 'buy' && s.afterNet <= 0) return false
      if (seg === 'transit' && s.intransit <= 0) return false
      if (seg === 'covered' && !(s.intransit > 0 && s.afterNet === 0)) return false
      if (drill && drill.tab === 'shortage' && drill.code && s.code !== drill.code) return false
      if (q) { const hay = (s.code + s.name + s.spec).toLowerCase(); if (!hay.includes(q.toLowerCase())) return false }
      return true
    })
    const { k, dir } = sort
    arr = [...arr].sort((a, b) => {
      let x: number | string = (a as any)[k], y: number | string = (b as any)[k]
      if (typeof x === 'string') { x = x || ''; y = (y as string) || ''; return x < y ? -dir : x > y ? dir : 0 }
      return (((x as number) || 0) - ((y as number) || 0)) * dir
    })
    return arr
  }, [K, q, seg, sort, drill])
  const totalBuy = rows.reduce((a, s) => a + s.afterNet, 0)
  const exportBuy = () => {
    const rs: (string | number)[][] = [['影响订单数', '子件编码', '名称', '规格', '属性', '总需求', '可用库存', '在途数量', '在途ETA', '尚需采购']]
    K.shortage.filter(s => s.afterNet > 0).forEach(s => rs.push([s.orders, s.code, s.name, s.spec, s.attr, s.demand, s.avail, s.intransit, s.eta ?? '', s.afterNet]))
    downloadCsv('采购缺料表_' + today() + '.csv', rs)
  }
  const segs: [string, string][] = [['all', '全部'], ['buy', '仍需采购'], ['transit', '已有在途'], ['covered', '在途全覆盖']]
  return (
    <div>
      {drill && drill.tab === 'shortage' && drillBar(drill.label, clearDrill)}
      <Toolbar>
        <Seg>{segs.map(([s, lab]) => <SegBtn key={s} on={seg === s} onClick={() => setSeg(s)}>{lab}<span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7, marginLeft: 5 }}>{(counts as any)[s]}</span></SegBtn>)}</Seg>
        <Search value={q} onChange={setQ} placeholder="搜索 子件编码 / 名称 / 规格…" />
        <span style={{ fontSize: 12, color: P.ink2, fontFamily: MONO }}>尚需采购合计 <b style={{ color: P.bad }}>{fmt(totalBuy)}</b></span>
        <button style={btn(true)} onClick={exportBuy}><Icon n="download" s={14} />导出采购缺料表</button>
      </Toolbar>
      <div style={{ ...panel, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <SortTh k="orders" label="影响订单" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="code" label="子件编码" sort={sort} setSort={setSort} />
            <SortTh k="name" label="名称" sort={sort} setSort={setSort} />
            <th style={thBase}>规格</th>
            <SortTh k="attr" label="属性" sort={sort} setSort={setSort} />
            <th style={thBase}>库存构成</th>
            <SortTh k="demand" label="总需求" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="avail" label="可用库存" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="intransit" label="在途" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="afterNet" label="尚需采购" sort={sort} setSort={setSort} num defDesc />
          </tr></thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${P.borderLt}` }}>
                <td style={{ ...tdBase, ...numStyle }}><span onClick={() => setDrill({ tab: 'orders', code: s.code, label: '缺料 ' + s.code + '（' + s.name + '）影响的订单' })} style={{ color: P.brand, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}><b>{s.orders}</b></span></td>
                <td style={{ ...tdBase, ...codeStyle }}>{s.code}</td>
                <td style={tdBase}>{s.name}</td>
                <td style={{ ...tdBase, color: P.ink2, fontSize: 11 }}>{s.spec}</td>
                <td style={{ ...tdBase, color: s.attr === '自制' ? P.brand : P.warn }}>{s.attr}</td>
                <td style={tdBase}><CoverageBar avail={s.avail} intransit={s.intransit} net={s.net} /></td>
                <td style={{ ...tdBase, ...numStyle }}>{fmt(s.demand)}</td>
                <td style={{ ...tdBase, ...numStyle, color: P.ink2 }}>{fmt(s.avail)}</td>
                <td style={{ ...tdBase, ...numStyle }}>{s.intransit > 0 ? <span style={{ color: P.brand }}><b>{fmt(s.intransit)}</b><br /><small style={{ fontSize: 9.5, color: P.ink3 }}>{s.eta}</small></span> : <span style={{ color: P.ink3 }}>—</span>}</td>
                <td style={{ ...tdBase, ...numStyle }}><b style={{ color: s.afterNet > 0 ? P.bad : P.ok }}>{fmt(s.afterNet)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty big="没有匹配的缺料" />}
      </div>
      <Note>尚需采购 = 总需求 − 可用库存 − 在途数量。库存构成条：<i style={{ color: P.ok }}>■</i>可用 <i style={{ color: P.brand }}>■</i>在途 <i style={{ color: P.bad }}>■</i>待采购。按「影响订单数」降序，优先采购牵动面最广的料。点击影响订单数可钻取受影响订单。</Note>
    </div>
  )
}

// ════════════════ 视图 3：按客户 ════════════════
function CustomerView({ K, setDrill }: { K: WorkbenchData; setDrill: (d: Drill) => void }) {
  const [sort, setSort] = useState({ k: 'n', dir: -1 })
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    let arr = K.customers.filter(c => !q || c.customer.toLowerCase().includes(q.toLowerCase()))
    const { k, dir } = sort
    arr = [...arr].sort((a, b) => {
      let x: number | string = (a as any)[k], y: number | string = (b as any)[k]
      if (k === 'nextDue') { x = (x as string) || '9999'; y = (y as string) || '9999' }
      if (typeof x === 'string') return x < (y as string) ? -dir : x > (y as string) ? dir : 0
      return (((x as number) || 0) - ((y as number) || 0)) * dir
    })
    return arr
  }, [K, sort, q])
  const maxN = Math.max(1, ...K.customers.map(c => c.n))
  return (
    <div>
      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="搜索客户…" />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: P.ink2, fontFamily: MONO }}>共 {K.customers.length} 个客户 · 点击客户名钻取其订单</span>
      </Toolbar>
      <div style={{ ...panel, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <SortTh k="customer" label="客户" sort={sort} setSort={setSort} />
            <SortTh k="n" label="订单行" sort={sort} setSort={setSort} num defDesc />
            <th style={{ ...thBase, width: 200 }}>齐套构成</th>
            <SortTh k="openq" label="未清数量" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="rate" label="平均齐套率" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="buildable" label="可生产" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="transitKit" label="在途可齐" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="shortKinds" label="缺料种类" sort={sort} setSort={setSort} num defDesc />
            <SortTh k="nextDue" label="最近交期" sort={sort} setSort={setSort} num />
          </tr></thead>
          <tbody>
            {rows.map((c, i) => {
              const seg: [string, number][] = [[P.ok, c.kit], [P.warn, c.partial], [P.bad, c.bad], [P.gray, c.nobom]]
              return <tr key={i} style={{ borderBottom: `1px solid ${P.borderLt}` }}>
                <td style={tdBase}><span onClick={() => setDrill({ tab: 'orders', customer: c.customer, label: '客户 ' + c.customer })} style={{ color: P.brand, cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{c.customer}</span></td>
                <td style={{ ...tdBase, ...numStyle }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'flex-end' }}>
                    <span style={{ fontFamily: MONO, fontWeight: 600 }}>{c.n}</span>
                    <span style={{ display: 'inline-flex', maxWidth: 54, height: 9, borderRadius: 5, background: P.grayBg, overflow: 'hidden', flex: 1 }}><i style={{ height: '100%', width: (c.n / maxN * 100) + '%', background: P.brand }} /></span>
                  </span>
                </td>
                <td style={tdBase}>
                  <span style={{ display: 'flex', height: 9, borderRadius: 5, background: P.grayBg, overflow: 'hidden' }} title={`齐套${c.kit} 部分${c.partial} 全缺${c.bad} 无BOM${c.nobom}`}>
                    {seg.map(([col, v], j) => v > 0 && <i key={j} style={{ height: '100%', width: (v / c.n * 100) + '%', background: col }} />)}
                  </span>
                </td>
                <td style={{ ...tdBase, ...numStyle }}>{fmt(c.openq)}</td>
                <td style={{ ...tdBase, ...numStyle }}><b style={{ color: rateColor(c.rate) }}>{c.rate}%</b></td>
                <td style={{ ...tdBase, ...numStyle }}><b style={{ color: c.buildable ? P.ok : P.ink3 }}>{c.buildable}</b></td>
                <td style={{ ...tdBase, ...numStyle }}>{c.transitKit ? <b style={{ color: P.brand }}>{c.transitKit}</b> : <span style={{ color: P.ink3 }}>0</span>}</td>
                <td style={{ ...tdBase, ...numStyle }}>{c.shortKinds ? <b style={{ color: P.bad }}>{c.shortKinds}</b> : <span style={{ color: P.ink3 }}>0</span>}</td>
                <td style={{ ...tdBase, ...numStyle, ...codeStyle, fontSize: 11 }}>{c.nextDue || <span style={{ color: P.ink3 }}>—</span>}</td>
              </tr>
            })}
          </tbody>
        </table>
        {!rows.length && <Empty big="没有匹配的客户" />}
      </div>
      <Note>平均齐套率 = 该客户各订单齐套率均值。齐套构成条：<i style={{ color: P.ok }}>■</i>齐套 <i style={{ color: P.warn }}>■</i>部分 <i style={{ color: P.bad }}>■</i>全缺 <i style={{ color: P.gray }}>■</i>无BOM。缺料种类 = 该客户订单牵动的不同缺料子件数。</Note>
    </div>
  )
}

// ── 工具栏 / 分段 / 搜索 / 空态 / 脚注 ─────────────────────
function Toolbar({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, background: P.card, border: `1px solid ${P.border}`, borderRadius: 11, padding: '10px 12px' }}>{children}</div>
}
function Seg({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>{children}</div>
}
function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ border: 0, borderRight: `1px solid ${P.border}`, background: on ? P.ink : 'transparent', color: on ? P.bg : P.ink2, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{children}</button>
}
function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div style={{ flex: 1, minWidth: 170, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${P.border}`, borderRadius: 8, padding: '0 11px', background: '#fff' }}>
    <span style={{ color: P.ink3, display: 'flex' }}><Icon n="search" s={15} /></span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ border: 0, outline: 'none', padding: '8px 0', fontSize: 13, width: '100%', background: 'transparent', color: P.ink, fontFamily: 'inherit' }} />
  </div>
}
function Empty({ big, sub }: { big: string; sub?: string }) {
  return <div style={{ padding: '60px 20px', textAlign: 'center', color: P.ink2 }}><div style={{ fontSize: 16, fontWeight: 700, color: P.ink, marginBottom: 6 }}>{big}</div>{sub && <div>{sub}</div>}</div>
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 14, fontSize: 11, color: P.ink2, fontFamily: MONO, lineHeight: 1.7 }}>{children}</div>
}

// ════════════════ 使用帮助浮层 ════════════════
function HelpModal({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: React.ReactNode }) => <h3 style={{ fontSize: 14, fontWeight: 800, color: P.ink, margin: '22px 0 10px', paddingBottom: 6, borderBottom: `1px solid ${P.borderLt}` }}>{children}</h3>
  const code: React.CSSProperties = { fontFamily: MONO, fontSize: 11.5, background: P.card2, border: `1px solid ${P.borderLt}`, borderRadius: 4, padding: '1px 5px', color: P.brand2 }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: P.ink2, padding: '7px 10px', background: P.card2, borderBottom: `1.5px solid ${P.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: P.ink, borderBottom: `1px solid ${P.borderLt}`, verticalAlign: 'top', lineHeight: 1.5 }
  const dot = (c: string) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 6, verticalAlign: 'middle' }} />
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(24,23,21,.46)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 18px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: P.card, borderRadius: 14, maxWidth: 860, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        {/* 头 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: `1px solid ${P.border}`, position: 'sticky', top: 0, background: P.card, zIndex: 1 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: P.brand, display: 'grid', placeItems: 'center', color: '#efe9db', fontWeight: 800, fontSize: 16 }}>齐</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>齐套分析工作台 · 使用帮助</div>
            <div style={{ fontSize: 11, color: P.ink2, fontFamily: MONO, marginTop: 2 }}>销售明细 → 一级BOM → 可用库存 → 生产决策</div>
          </div>
          <button onClick={onClose} style={{ ...btn(), padding: '7px 10px' }}><Icon n="close" s={15} />关闭</button>
        </div>
        {/* 体 */}
        <div style={{ padding: '4px 22px 26px', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
          <H>它解决什么问题</H>
          <p style={{ fontSize: 13, color: P.ink, lineHeight: 1.7, margin: 0 }}>
            把黑湖的「销售订单明细 / 一级BOM / 库存」拉到一起，自动回答：<b>每张未交订单物料齐不齐、能否立刻开工、缺什么缺多少、该先采购什么。</b>
          </p>

          <H>三个视图</H>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>视图</th><th style={th}>看什么</th><th style={th}>怎么用</th></tr></thead>
            <tbody>
              <tr><td style={td}><b>按订单齐套</b></td><td style={td}>每张订单行的状态、齐套率、缺料项</td><td style={td}>排产主视图。点行首 <span style={code}>+</span> 展开子件明细；勾选齐套行 → 底部「导出生产清单」</td></tr>
              <tr><td style={td}><b>缺料采购</b></td><td style={td}>按子件汇总的缺口，按「影响订单数」排序</td><td style={td}>采购主视图。优先买牵动订单最多的料；「导出采购缺料表」</td></tr>
              <tr><td style={td}><b>按客户</b></td><td style={td}>每个客户的订单数、齐套构成、平均齐套率</td><td style={td}>对客户答交期。点客户名钻取其全部订单</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: P.ink2, margin: '10px 0 0', lineHeight: 1.6 }}>
            <b>钻取</b>：从子件 / 客户点进去会跳到「按订单齐套」并自动过滤，顶部出现绿色「钻取视图」条，点「清除 ✕」恢复。
          </p>

          <H>顶部操作</H>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>同步时间</td><td style={td}>黑湖接口数据最近一次同步入库的时间（精确到时分秒）</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>刷新</td><td style={td}>重新从黑湖接口拉取数据入库，再刷新看板（不是只刷新页面）</td></tr>
            </tbody>
          </table>

          <H>字段来源（均来自黑湖三张同步宽表）</H>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>看板字段</th><th style={th}>来源</th><th style={th}>说明</th></tr></thead>
            <tbody>
              <tr><td style={td}>未清</td><td style={td}><span style={code}>pending_qty</span> 缺省回落 qty</td><td style={td}>需求量＝未清数量，只看未清&gt;0 的行</td></tr>
              <tr><td style={td}>交货日期</td><td style={td}><span style={code}>arrival_plan_time</span></td><td style={td}>用于交期倒计时与紧迫度</td></tr>
              <tr><td style={td}>成品库存</td><td style={td}>库存表中该成品 <span style={code}>stock_qty</span></td><td style={td}>展示用</td></tr>
              <tr><td style={td}>子件用量</td><td style={td}>BOM <span style={code}>unit_qty</span></td><td style={td}>同一子件多工序按编码合并</td></tr>
              <tr><td style={td}>子件属性</td><td style={td}><span style={code}>origin_type</span></td><td style={td}>0=自制 / 1=外购 / 2=委外</td></tr>
              <tr><td style={td}>产品族 / 口径</td><td style={td}>型号首字母 + 规格中 DN 解析</td><td style={td}>如 Z=闸阀、J=截止阀；DN50</td></tr>
              <tr><td style={td}>在途相关</td><td style={td} colSpan={2}><b style={{ color: P.warn }}>⚠ 当前为示意性推算，待接入真实在途接口</b></td></tr>
            </tbody>
          </table>

          <H>搜索</H>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>按订单齐套</td><td style={td}>订单号 / 客户 / 产品编码 / 规格 / 产品族 / 口径（+ 状态分段、仅看可生产）</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>缺料采购</td><td style={td}>子件编码 / 名称 / 规格（+ 仍需采购 / 已有在途 / 在途全覆盖 分段）</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>按客户</td><td style={td}>客户名</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: P.ink2, margin: '8px 0 0' }}>列头可点击排序（↕ / ▲ / ▼）。</p>

          <H>指标定义</H>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12 }}>{dot(P.ok)}<b>齐套</b> 0项缺 → 可立即生产</span>
            <span style={{ fontSize: 12 }}>{dot(P.warn)}<b>部分齐套</b> 部分子件缺</span>
            <span style={{ fontSize: 12 }}>{dot(P.bad)}<b>全缺</b> 全部子件缺</span>
            <span style={{ fontSize: 12 }}>{dot(P.gray)}<b>无BOM</b> 查不到子件，需先维护</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>齐套率</td><td style={td}>(子件总数 − 缺料子件数) ÷ 子件总数 × 100%</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>本单可分配</td><td style={td}>引擎按交期早的订单优先统筹扣减库存，分给该订单的量</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>缺口</td><td style={td}>该子件需求 − 本单可分配</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>优先度（0–4）</td><td style={td}>综合评分：齐套 &gt; 在途可齐 &gt; 部分齐套，再叠加交期紧迫度与未清量</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>交期紧迫</td><td style={td}>≤14天=高(红) / ≤30天=中(黄) / &gt;30天=低</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>尚需采购</td><td style={td}>总需求 − 可用库存 − 在途数量</td></tr>
              <tr><td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>影响订单数</td><td style={td}>因该料产生缺口的订单数（采购排序主键，越大越该先买）</td></tr>
            </tbody>
          </table>

          <H>上手三步</H>
          <ol style={{ fontSize: 13, color: P.ink, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
            <li>点 <b>刷新</b> 拉最新数据，看「同步时间」确认是最新。</li>
            <li>看顶部 KPI 把握全局 → 进 <b>按订单齐套</b>，按优先度从上往下排产，勾齐套行导出生产清单。</li>
            <li>进 <b>缺料采购</b>，按「影响订单数」从上往下下采购单，导出采购缺料表。</li>
          </ol>
          <div style={{ marginTop: 16, padding: '11px 14px', background: P.warnBg, border: `1px solid ${P.warnSoft}`, borderRadius: 9, fontSize: 12, color: '#7a5a10', lineHeight: 1.6 }}>
            ⚠ 在途相关数字目前为示意性推算。接入真实在途接口前，采购决策请以「尚需采购 = 总需求 − 可用库存」为准。
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════ 工作台外壳 ════════════════
export function PageKitting() {
  const [data, setData] = useState<WorkbenchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('orders')
  const [drill, setDrillState] = useState<Drill>(null)
  const [sel, setSel] = useState<Set<number>>(() => new Set())
  const [help, setHelp] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    fetch('/api/blacklake/kitting').then(r => r.json()).then(d => {
      if (!d.ok) throw new Error(d.error || '加载失败')
      setData(d as WorkbenchData)
    }).catch(e => setError((e as Error).message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  // 刷新：先调黑湖接口重新拉取数据入库（同步），再重读仪表盘数据。失败仅提示，不清空现有看板。
  const refresh = () => {
    if (syncing) return
    setSyncing(true)
    fetch('/api/blacklake/sync', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (!d.ok) throw new Error(d.error || '同步失败') })
      .then(() => fetch('/api/blacklake/kitting').then(r => r.json()))
      .then(d => { if (!d.ok) throw new Error(d.error || '加载失败'); setData(d as WorkbenchData); setError(null) })
      .catch(e => alert('刷新失败：' + (e as Error).message))
      .finally(() => setSyncing(false))
  }

  const setDrill = (t: Drill) => { setDrillState(t); if (t) setTab(t.tab) }
  const clearDrill = () => setDrillState(null)
  const goTab = (t: string) => { setTab(t); if (drill && drill.tab !== t) setDrillState(null) }

  if (loading) return <Shell><div style={{ padding: 60, textAlign: 'center', color: P.ink2 }}>加载齐套数据中…</div></Shell>
  if (error) return <Shell><div style={{ ...panel, padding: 28, textAlign: 'center' }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: P.bad, marginBottom: 8 }}>加载失败</div>
    <div style={{ fontSize: 12, color: P.ink2, marginBottom: 16 }}>{error}</div>
    <button style={btn(true)} onClick={load}><Icon n="refresh" s={14} />重试</button>
  </div></Shell>
  if (!data || !data.lines.length) return <Shell><div style={{ ...panel, padding: 40, textAlign: 'center' }}>
    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>暂无齐套数据</div>
    <div style={{ fontSize: 12.5, color: P.ink2, marginBottom: 16 }}>点「刷新」从黑湖接口拉取订单 / BOM / 库存入库，或在「数据与规则」中同步后回到此页。</div>
    <button style={{ ...btn(true), opacity: syncing ? 0.6 : 1 }} onClick={refresh} disabled={syncing}><Icon n="refresh" s={14} />{syncing ? '刷新中…' : '刷新'}</button>
  </div></Shell>

  const K = data, k = K.kpi
  const kpis: { c: string; num: number; lab: string; sub: string; go?: () => void }[] = [
    { c: P.brand, num: k.total, lab: '待齐产订单行', sub: '进行中 · 未清>0' },
    { c: P.ok, num: k.kit, lab: '可立即生产', sub: '物料齐套', go: () => goTab('orders') },
    { c: P.warn, num: k.partial, lab: '部分齐套', sub: '补齐缺料即可' },
    { c: P.bad, num: k.bad, lab: '物料全缺', sub: '需先采购' },
    { c: P.gold, num: k.transitKit, lab: '在途到货可齐', sub: '跟踪采购到货' },
    { c: P.gray, num: k.shortKinds, lab: '缺料种类', sub: '尚需采购 ' + fmt(k.buyTotal), go: () => goTab('shortage') },
  ]
  const tabs: [string, string, string, number | null][] = [
    ['orders', '按订单齐套', 'orders', k.total],
    ['shortage', '缺料采购', 'cart', k.shortKinds],
    ['customer', '按客户', 'users', K.customers.length],
  ]
  let selQ = 0; sel.forEach(i => selQ += K.lines[i].openq)
  const exportPlan = () => {
    const ids = sel.size ? [...sel] : K.lines.filter(l => l.status === '齐套').map(l => l._id)
    const rs: (string | number)[][] = [['订单编号', '客户', '产品编码', '产品族', '口径', '规格', '交货日期', '未清数量', '齐套状态']]
    ids.map(i => K.lines[i]).forEach(l => rs.push([l.order, l.customer, l.pcode, l.family, l.caliber, l.pspec, l.due ?? '', l.openq, l.status]))
    downloadCsv('生产清单_' + today() + '.csv', rs)
  }

  return (
    <Shell>
      {/* 标签 + 工具栏（同步时间 / 帮助 / 刷新）*/}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(([t, lab, icon, cnt]) => {
            const on = tab === t
            return <div key={t} onClick={() => goTab(t)} style={{ fontWeight: 700, fontSize: 13, padding: '9px 15px', border: `1px solid ${on ? P.brand : P.border}`, borderRadius: 9, cursor: 'pointer', color: on ? '#f1ebdd' : P.ink2, background: on ? P.brand : P.card, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon n={icon} s={15} />{lab}{cnt != null && <span style={{ fontFamily: MONO, fontSize: 11, background: on ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.07)', padding: '1px 7px', borderRadius: 20 }}>{cnt}</span>}
            </div>
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span title="黑湖小工单接口数据最近一次同步入库的时间" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: '5px 12px', fontFamily: MONO, fontSize: 11, color: P.ink2 }}><Icon n="clock" s={12} /> 同步时间 <b style={{ color: P.brand }}>{fmtDateTime(K.syncedAt)}</b></span>
          <button style={btn()} onClick={() => setHelp(true)} title="查看工作台使用说明"><Icon n="help" s={14} />使用帮助</button>
          <button style={{ ...btn(), opacity: syncing ? 0.6 : 1, cursor: syncing ? 'default' : 'pointer' }} onClick={refresh} disabled={syncing} title="重新拉取黑湖接口数据入库并刷新看板"><Icon n="refresh" s={14} />{syncing ? '刷新中…' : '刷新'}</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 11, marginBottom: 16 }}>
        {kpis.map((c, i) => (
          <div key={i} onClick={c.go} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, padding: '13px 15px', position: 'relative', overflow: 'hidden', cursor: c.go ? 'pointer' : 'default' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c.c }} />
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', lineHeight: 1, color: c.c }}>{c.num.toLocaleString()}</div>
            <div style={{ fontSize: 11.5, color: P.ink2, marginTop: 7, fontWeight: 600 }}>{c.lab}</div>
            <div style={{ fontSize: 10, color: P.ink3, marginTop: 2, fontFamily: MONO }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {tab === 'orders' && <OrdersView K={K} drill={drill} clearDrill={clearDrill} sel={sel} setSel={setSel} setDrill={setDrill} />}
      {tab === 'shortage' && <ShortageView K={K} drill={drill} clearDrill={clearDrill} setDrill={setDrill} />}
      {tab === 'customer' && <CustomerView K={K} setDrill={setDrill} />}

      {/* 生产选择 Dock */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'rgba(24,23,21,.98)', color: P.bg, padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 18, justifyContent: 'center', zIndex: 40, boxShadow: '0 -8px 30px rgba(0,0,0,.22)', transform: sel.size ? 'translateY(0)' : 'translateY(115%)', transition: 'transform .26s cubic-bezier(.3,.8,.3,1)' }}>
        <div style={{ fontFamily: MONO, fontSize: 13 }}>已选生产 <b style={{ fontSize: 19, color: '#fff' }}>{sel.size}</b> 单 · 含未清 <b style={{ fontSize: 19, color: '#fff' }}>{fmt(selQ)}</b> 件 <span style={{ color: '#8fcbb0' }}>· 均为齐套，可下达生产</span></div>
        <button style={{ ...btn(), background: '#3a3833', color: P.bg, borderColor: '#55514a' }} onClick={() => setSel(new Set())}>清空</button>
        <button style={btn(true)} onClick={exportPlan}><Icon n="download" s={14} />导出生产清单 CSV</button>
      </div>

      {help && <HelpModal onClose={() => setHelp(false)} />}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1480, margin: '0 auto', padding: '4px 4px 130px' }}>{children}</div>
}
