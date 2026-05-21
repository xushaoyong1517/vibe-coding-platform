'use client'

import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// SKILL prompts 已移至服务端 app/api/claude/skills/
// 客户端只传 skill 名称，不暴露提示词内容

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface QuoteItem {
  类型: string
  规格?: string
  DN: number
  压力: number
  数量: number
  驱动: string
  连接: string
  主体: string
  阀瓣阀闸: string
  阀座: string
  阀杆轴: string
  螺柱: string
  中腔填料: string
  件号: string
  设计标准: string
  工厂编号?: string
  置信度?: string
  待确认?: string[]
  特殊?: string
  备注?: string
}

interface BOMRow {
  序号: number
  零件: string
  材质: string
  来源: string
}

interface BOMResult {
  item: QuoteItem
  bom: BOMRow[]
  牌1: string
  牌2: string
}

interface Quote {
  id: string
  客户: string
  订单号: string
  日期: string
  状态: string
  台计: number
  items: QuoteItem[]
  bomData?: BOMResult[]
}

interface Param {
  id: string
  类型: string
  DN: number
  压力: number
  驱动: string
  连接: string
  主体: string
  阀瓣阀闸: string
  阀座: string
  阀杆轴: string
  螺柱: string
  中腔填料: string
  设计标准: string
  件号: string
  次数: number
  数量: number
}

interface TrimRow {
  号: string
  阀瓣: string
  阀座: string
  阀杆: string
  压套: string
  名称: string
}

type PageState =
  | { name: 'dashboard' }
  | { name: 'newQuote' }
  | { name: 'quotes' }
  | { name: 'quoteDetail'; data: Quote }
  | { name: 'params' }
  | { name: 'rules' }

// ════════════════════════════════════════════════════
// SEED DATA
// ════════════════════════════════════════════════════

const SEED_PARAMS: Param[] = [
  // 闸阀（来自2026年订单统计）
  { id: 'g01', 类型: '闸阀', DN: 50,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 11, 数量: 151 },
  { id: 'g02', 类型: '闸阀', DN: 50,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+STL',  阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '5#', 次数: 8,  数量: 120 },
  { id: 'g03', 类型: '闸阀', DN: 50,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'CF8', 阀瓣阀闸: 'CF8+STL',  阀座: '本体+STL', 阀杆轴: 'F304', 螺柱: 'B8/8', 中腔填料: '316+石墨', 设计标准: 'API 600', 件号: '15#', 次数: 4, 数量: 18 },
  { id: 'g04', 类型: '闸阀', DN: 50,  压力: 300, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 10, 数量: 72 },
  { id: 'g05', 类型: '闸阀', DN: 50,  压力: 600, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 2,  数量: 8 },
  { id: 'g06', 类型: '闸阀', DN: 80,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 10, 数量: 145 },
  { id: 'g07', 类型: '闸阀', DN: 80,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+STL',  阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '5#', 次数: 11, 数量: 156 },
  { id: 'g08', 类型: '闸阀', DN: 80,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'CF8', 阀瓣阀闸: 'CF8+STL',  阀座: '本体+STL', 阀杆轴: 'F304', 螺柱: 'B8/8', 中腔填料: '316+石墨', 设计标准: 'API 600', 件号: '15#', 次数: 3, 数量: 9 },
  { id: 'g09', 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 17, 数量: 313 },
  { id: 'g10', 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+STL',  阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '5#', 次数: 11, 数量: 439 },
  { id: 'g11', 类型: '闸阀', DN: 100, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'CF3', 阀瓣阀闸: 'CF3+STL',  阀座: '本体+STL', 阀杆轴: 'F304L', 螺柱: 'B8/8', 中腔填料: '316+石墨', 设计标准: 'API 600', 件号: '15#', 次数: 2, 数量: 6 },
  { id: 'g12', 类型: '闸阀', DN: 100, 压力: 300, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 8,  数量: 45 },
  { id: 'g13', 类型: '闸阀', DN: 150, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 7,  数量: 101 },
  { id: 'g14', 类型: '闸阀', DN: 150, 压力: 300, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 7,  数量: 65 },
  { id: 'g15', 类型: '闸阀', DN: 200, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 10, 数量: 79 },
  { id: 'g16', 类型: '闸阀', DN: 200, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+STL',  阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '5#', 次数: 4,  数量: 28 },
  { id: 'g17', 类型: '闸阀', DN: 200, 压力: 300, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 7,  数量: 51 },
  { id: 'g18', 类型: '闸阀', DN: 250, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 5,  数量: 35 },
  { id: 'g19', 类型: '闸阀', DN: 300, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 3,  数量: 12 },
  // 截止阀
  { id: 'j01', 类型: '截止阀', DN: 50,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'A105+13Cr', 阀座: '本体+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 6, 数量: 21 },
  { id: 'j02', 类型: '截止阀', DN: 50,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'CF8', 阀瓣阀闸: 'F304',      阀座: '本体+STL', 阀杆轴: 'F304', 螺柱: 'B8/8', 中腔填料: '316+石墨', 设计标准: 'API 600', 件号: '2#', 次数: 1, 数量: 4 },
  { id: 'j03', 类型: '截止阀', DN: 50,  压力: 300, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'A105+13Cr', 阀座: '本体+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 3, 数量: 6 },
  { id: 'j04', 类型: '截止阀', DN: 80,  压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'A105+13Cr', 阀座: '本体+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 4, 数量: 12 },
  { id: 'j05', 类型: '截止阀', DN: 100, 压力: 150, 驱动: '手轮', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'A105+13Cr', 阀座: '本体+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 600', 件号: '8#', 次数: 3, 数量: 8 },
  // 止回阀
  { id: 'h01', 类型: '止回阀', DN: 50,  压力: 150, 驱动: '/', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+STL',  阀座: '本体+STL', 阀杆轴: '/', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 594', 件号: '5#', 次数: 2, 数量: 6 },
  { id: 'h02', 类型: '止回阀', DN: 80,  压力: 150, 驱动: '/', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: '本体+STL', 阀杆轴: '/', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 594', 件号: '8#', 次数: 5, 数量: 30 },
  { id: 'h03', 类型: '止回阀', DN: 100, 压力: 150, 驱动: '/', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: '本体+STL', 阀杆轴: '/', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 594', 件号: '8#', 次数: 3, 数量: 15 },
  { id: 'h04', 类型: '止回阀', DN: 150, 压力: 150, 驱动: '/', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: '本体+STL', 阀杆轴: '/', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 594', 件号: '8#', 次数: 3, 数量: 10 },
  { id: 'h05', 类型: '止回阀', DN: 200, 压力: 150, 驱动: '/', 连接: 'RF', 主体: 'WCB', 阀瓣阀闸: 'WCB+13Cr', 阀座: '本体+STL', 阀杆轴: '/', 螺柱: 'B7/2H', 中腔填料: '304+石墨', 设计标准: 'API 594', 件号: '8#', 次数: 2, 数量: 8 },
]

const SEED_QUOTES: Quote[] = [
  {
    id: 'q001', 客户: '中国石化工程', 订单号: 'Y260416-109', 日期: '2026-04-18', 状态: '已确认', 台计: 15,
    items: [
      { 类型: '闸阀', 规格: 'Z2-150CF8', 数量: 4, DN: 50, 压力: 150, 主体: 'CF8', 阀瓣阀闸: 'CF8+STL', 阀座: '本体+STL', 阀杆轴: 'F304', 螺柱: 'B8/8', 中腔填料: '304+低泄漏', 件号: '15#', 驱动: '手轮', 连接: 'RF', 设计标准: 'API 600', 备注: 'B' },
      { 类型: '闸阀', 规格: 'Z4-150WCB', 数量: 3, DN: 100, 压力: 150, 主体: 'WCB', 阀瓣阀闸: 'WCB+STL', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+低泄漏', 件号: '5#', 驱动: '手轮', 连接: 'RF', 设计标准: 'API 600', 备注: 'B' },
      { 类型: '闸阀', 规格: 'Z8-300WCB', 数量: 2, DN: 200, 压力: 300, 主体: 'WCB', 阀瓣阀闸: 'WCB+STL', 阀座: 'A105+STL', 阀杆轴: 'F6a', 螺柱: 'B7/2H', 中腔填料: '304+低泄漏', 件号: '5#', 驱动: '手轮', 连接: 'RF', 设计标准: 'API 600', 特殊: '碳覆盖层', 备注: 'B' },
    ],
  },
]

const TRIM_TABLE: TrimRow[] = [
  { 号: '1#',  阀瓣: 'Cr13',         阀座: 'Cr13',         阀杆: 'Cr13(=F6a)', 压套: 'Cr13(=12Cr13)', 名称: '平装（碳钢无锻）' },
  { 号: '2#',  阀瓣: '304',           阀座: '304',           阀杆: '304(=F304)', 压套: '304(=F304)',    名称: '304本体' },
  { 号: '3#',  阀瓣: '310',           阀座: '310',           阀杆: '310',        压套: 'Cr13',          名称: '310系（高温）' },
  { 号: '4#',  阀瓣: '硬Cr14',        阀座: '硬Cr13',        阀杆: 'Cr13',       压套: 'Cr13',          名称: '硬化13Cr' },
  { 号: '5#',  阀瓣: 'HF(STL堆焊)',   阀座: 'HF(STL堆焊)',   阀杆: 'Cr13(=F6a)', 压套: 'Cr13',          名称: '全堆焊' },
  { 号: '6#',  阀瓣: 'Cu-Ni',         阀座: 'Cr13',          阀杆: 'Cr13',       压套: 'Cr13',          名称: '铜镍' },
  { 号: '7#',  阀瓣: 'Cr13',          阀座: '硬Cr13',        阀杆: 'Cr13',       压套: 'Cr13',          名称: '硬化座' },
  { 号: '8#',  阀瓣: 'Cr13',          阀座: 'HF(STL堆焊)',   阀杆: 'Cr13(=F6a)', 压套: 'Cr13',          名称: '半堆焊（13Cr瓣+STL座）' },
  { 号: '9#',  阀瓣: 'Monel',         阀座: 'Monel',         阀杆: 'Monel',      压套: 'Monel',         名称: '蒙乃尔全系' },
  { 号: '10#', 阀瓣: '316',           阀座: '316',           阀杆: '316(=F316)', 压套: '316',           名称: '316系' },
  { 号: '11#', 阀瓣: 'Monel',         阀座: 'HF',            阀杆: 'Monel',      压套: 'Monel',         名称: '蒙乃尔+堆焊座' },
  { 号: '12#', 阀瓣: '316',           阀座: 'HF(STL堆焊)',   阀杆: '316(=F316)', 压套: '316',           名称: '316半堆焊' },
  { 号: '13#', 阀瓣: '20号钢',        阀座: '20号钢',        阀杆: '20号钢',     压套: '20号钢',        名称: '碳素钢系' },
  { 号: '14#', 阀瓣: 'HF',            阀座: '20号钢',        阀杆: '20号钢',     压套: '20号钢',        名称: '堆焊瓣+20号座' },
  { 号: '15#', 阀瓣: 'HF(STL堆焊)',   阀座: 'HF(STL堆焊)',   阀杆: '304(=F304)', 压套: '304',           名称: '304全堆焊' },
  { 号: '16#', 阀瓣: 'HF(STL堆焊)',   阀座: 'HF(STL堆焊)',   阀杆: '316(=F316)', 压套: '316',           名称: '316全堆焊' },
  { 号: '17#', 阀瓣: 'HF',            阀座: 'HF',            阀杆: '347',        压套: '347',           名称: '347系' },
  { 号: '18#', 阀瓣: 'HF',            阀座: 'HF',            阀杆: '20号钢',     压套: '20号钢',        名称: '堆焊+20号钢杆' },
]

// ════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════

const C = {
  bg: '#f5f5f0',
  sidebar: '#1a1f2e',
  sideHover: '#262d40',
  sideActive: '#364156',
  card: '#fff',
  border: '#e2e0d8',
  borderLight: '#f0ede6',
  text: '#2c2c2c',
  textDim: '#7a7a70',
  textLight: '#a5a59a',
  accent: '#c05028',
  blue: '#2c6fbb',
  green: '#2a7a4b',
  amber: '#b8860b',
  tag: { 闸阀: '#2c6fbb', 截止阀: '#c05028', 止回阀: '#2a7a4b' } as Record<string, string>,
  status: { 已确认: '#2a7a4b', 报价中: '#b8860b', 草稿: '#7a7a70' } as Record<string, string>,
}

// ════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════

function Tag({ children, color = C.blue }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: color + '18', color }}>
      {children}
    </span>
  )
}

function Btn({ children, onClick, variant = 'primary', small, disabled, style: sx }: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  small?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const v = {
    primary: { background: C.accent, color: '#fff' },
    secondary: { background: C.border, color: C.text },
    ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}` },
  }
  return (
    <button
      style={{ border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 4, fontWeight: 600, fontFamily: 'inherit', fontSize: small ? 12 : 13, padding: small ? '4px 10px' : '7px 16px', opacity: disabled ? 0.5 : 1, ...v[variant], ...sx }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Card({ title, extra, children, style: sx }: {
  title?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, ...sx }}>
      {title && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
          {extra}
        </div>
      )}
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  )
}

interface Column {
  title: string
  key: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

function DataTable({ columns, data, onRowClick, rowKey = 'id' }: {
  columns: Column[]
  data: Record<string, unknown>[]
  onRowClick?: (row: Record<string, unknown>) => void
  rowKey?: string
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr
              key={(row[rowKey] as string) ?? ri}
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default', borderBottom: `1px solid ${C.borderLight}` }}
              onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = '#faf8f5' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {columns.map((c, ci) => (
                <td key={ci} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: C.textLight }}>暂无数据</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════
// PAGE: 新建报价（核心三步流程）
// ════════════════════════════════════════════════════

function PageNewQuote({ params, setQuotes, setPage }: {
  params: Param[]
  setQuotes: React.Dispatch<React.SetStateAction<Quote[]>>
  setPage: (p: PageState) => void
}) {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<QuoteItem[] | null>(null)
  const [bomResults, setBomResults] = useState<BOMResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const callAI = async (skill: string, userMsg: string): Promise<string> => {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, message: userMsg }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.text || ''
  }

  const parseJSON = (text: string) => {
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  }

  const handleExtract = async () => {
    if (!input.trim()) return
    setLoading(true); setError(null)
    try {
      const raw = await callAI('param-extract', input)
      const parsed = parseJSON(raw)
      if (parsed?.items) { setExtracted(parsed.items); setStep(1) }
      else setError('AI 返回格式异常，请重试或换种描述方式')
    } catch (e) { setError('请求失败: ' + (e as Error).message) }
    setLoading(false)
  }

  const handleGenBOM = async () => {
    if (!extracted) return
    setLoading(true); setError(null)
    try {
      const results: BOMResult[] = []
      for (const item of extracted) {
        const raw = await callAI('bom-generate', JSON.stringify(item))
        const parsed = parseJSON(raw)
        results.push({ item, bom: parsed?.bom || [], 牌1: parsed?.牌1 || '', 牌2: parsed?.牌2 || '' })
      }
      setBomResults(results); setStep(2)
    } catch (e) { setError('BOM 生成失败: ' + (e as Error).message) }
    setLoading(false)
  }

  const handleSave = () => {
    if (!extracted || !bomResults) return
    const newQuote: Quote = {
      id: 'q' + Date.now(),
      客户: '新客户',
      订单号: 'Q' + new Date().toISOString().slice(2, 10).replace(/-/g, ''),
      日期: new Date().toISOString().slice(0, 10),
      状态: '草稿',
      台计: extracted.reduce((s, i) => s + (i.数量 || 1), 0),
      items: extracted.map(i => ({ ...i, 规格: i.工厂编号 || '' })),
      bomData: bomResults,
    }
    setQuotes(prev => [newQuote, ...prev])
    setPage({ name: 'quoteDetail', data: newQuote })
  }

  const findMatch = (item: QuoteItem) =>
    params.find(p => p.类型 === item.类型 && p.DN === item.DN && p.压力 === item.压力 && p.主体 === item.主体 && p.阀瓣阀闸 === item.阀瓣阀闸)

  const steps = ['① 输入客户需求', '② 确认参数', '③ 生成BOM']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 步骤指示器 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: i === step ? 700 : 400, background: i === step ? C.accent + '15' : i < step ? C.green + '12' : 'transparent', color: i === step ? C.accent : i < step ? C.green : C.textLight, borderBottom: i === step ? `2px solid ${C.accent}` : '2px solid transparent' }}>{s}</div>
        ))}
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>{error}</div>}

      {/* Step 0: 输入 */}
      {step === 0 && (
        <Card title="客户需求输入" extra={<span style={{ fontSize: 12, color: C.textDim }}>支持自然语言、阀门编码、五环TAG</span>}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'输入示例：\n• 客户要4寸300磅碳钢闸阀，哈斯特加硬，6只\n• Z61H-800LbC-25\n• 4" RF Z2A3A05-P2G3\n• 闸阀DN100 150LB WCB 件号8# ×4只\n  截止阀DN80 150LB WCB 件号8# ×2只'}
            style={{ width: '100%', minHeight: 140, padding: 12, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.7 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {['闸阀 4寸 300磅 碳钢 哈斯特加硬 4只', 'Z61H-800LbC-25 2只', '4" RF Z2A3A05-P2G3', 'DN100 150LB WCB 8#件号 闸阀×6 截止阀×2'].map(ex => (
              <button key={ex} onClick={() => setInput(ex)} style={{ padding: '4px 10px', border: `1px solid ${C.border}`, borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: C.textDim }}>{ex}</button>
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={handleExtract} disabled={loading || !input.trim()}>{loading ? 'AI 提取中...' : '提取参数 →'}</Btn>
          </div>
        </Card>
      )}

      {/* Step 1: 确认参数 */}
      {step === 1 && extracted && (
        <Card title={`参数提取结果（${extracted.length} 行）`} extra={<Btn variant="ghost" small onClick={() => { setStep(0); setExtracted(null) }}>← 重新输入</Btn>}>
          {extracted.map((item, idx) => {
            const match = findMatch(item)
            return (
              <div key={idx} style={{ padding: 12, marginBottom: 10, background: '#fafaf7', borderRadius: 6, border: `1px solid ${C.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Tag color={C.tag[item.类型] ?? C.blue}>{item.类型}</Tag>
                  <span style={{ fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>DN{item.DN} {item.压力}LB</span>
                  <span style={{ color: C.textDim }}>× {item.数量 || 1}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: C.blue }}>{item.工厂编号}</span>
                  <div style={{ flex: 1 }} />
                  {match ? <Tag color={C.green}>✓ 历史匹配 ×{match.次数}次</Tag> : <Tag color={C.amber}>首次配置</Tag>}
                  <Tag color={C.blue}>件号{item.件号}</Tag>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, fontSize: 12 }}>
                  {([['主体', item.主体], ['阀瓣/阀闸', item.阀瓣阀闸], ['阀座', item.阀座], ['阀杆/轴', item.阀杆轴], ['螺柱', item.螺柱], ['填料', item.中腔填料]] as [string, string][]).map(([k, v]) => (
                    <div key={k} style={{ background: '#fff', padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.borderLight}` }}>
                      <div style={{ fontSize: 10, color: C.textLight }}>{k}</div>
                      <div style={{ fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {item.待确认 && item.待确认.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: C.amber }}>⚠ 待确认: {item.待确认.join(', ')}</div>
                )}
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => { setStep(0); setExtracted(null) }}>修改</Btn>
            <Btn onClick={handleGenBOM} disabled={loading}>{loading ? '生成BOM中...' : '确认参数，生成BOM →'}</Btn>
          </div>
        </Card>
      )}

      {/* Step 2: BOM 结果 */}
      {step === 2 && bomResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bomResults.map((r, idx) => (
            <Card
              key={idx}
              title={<span><Tag color={C.tag[r.item.类型] ?? C.blue}>{r.item.类型}</Tag><span style={{ marginLeft: 8 }}>DN{r.item.DN} {r.item.压力}LB {r.item.主体} · 件号{r.item.件号}</span></span>}
              extra={<span style={{ fontSize: 12, color: C.textDim }}>牌1: {r.牌1} | 牌2: {r.牌2}</span>}
            >
              <DataTable
                columns={[
                  { title: '#', key: '序号', render: v => <span style={{ fontFamily: "'DM Mono',monospace", color: C.textDim }}>{v as number}</span> },
                  { title: '零件', key: '零件', render: v => <span style={{ fontWeight: 600 }}>{v as string}</span> },
                  { title: '材质', key: '材质', render: v => <span style={{ fontFamily: "'DM Mono',monospace" }}>{v as string}</span> },
                  { title: '来源', key: '来源', render: v => <Tag color={(v as string)?.includes('牌1') ? C.blue : (v as string)?.includes('牌2') ? C.amber : C.textLight}>{v as string}</Tag> },
                ]}
                data={r.bom as unknown as Record<string, unknown>[]}
                rowKey="序号"
              />
            </Card>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => { setStep(1); setBomResults(null) }}>← 修改参数</Btn>
            <Btn onClick={handleSave}>保存为报价单</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// PAGE: 规则库（两张规则表）
// ════════════════════════════════════════════════════

function PageRules() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="规则表1：零部件材质表" extra={<span style={{ fontSize: 12, color: C.textDim }}>牌1 · 主体材质→组件</span>}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>给定主体材质列，查对应行得到10个组件材质</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f5f0' }}>
                {['#', '零件', '碳钢 WCB', '镍铬 WC6', '304 CF8', '316 CF8M', '低温 LCB', 'Monel'].map((h, i) => (
                  <th key={i} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['1', '阀体', 'A216 WCB/A105', 'A217 WC6', 'A351 CF8/F304', 'A351 CF8M', 'LCB/LF2', 'Monel'],
                ['2', '阀盖', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体'],
                ['3', '阀座', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2'],
                ['4', '阀瓣', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2'],
                ['5', '阀杆', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2'],
                ['6', '填料', '304+石墨', '304+石墨', '304+石墨', '304+石墨', '316+石墨', '316+石墨'],
                ['7', '螺柱', 'A193 B7', 'A193 B16', 'A320 B8', 'A193 B8M', 'A320-L7', 'A193 B8M'],
                ['8', '螺母', 'A194 2H', 'A194-4', 'A194-8', 'A194-8M', 'A194-4', 'A194-8M'],
                ['9', '填料', '石墨+缠绕', '同左', '同左', '同左', '同左', '同左'],
                ['10', '填料压套', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2', '→牌2'],
                ['11', '填料压板', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体'],
                ['12', '支承', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体', '同阀体'],
                ['13', '阀杆螺母', 'ZQAL9-4', '同左', '同左', '同左', '同左', '同左'],
                ['14', '手轮', 'KTH350-10', '同左', '同左', '同左', '同左', '同左'],
              ].map((r, ri) => (
                <tr key={ri} style={{ background: r[2]?.startsWith('→') ? '#fff8e1' : 'transparent', borderBottom: `1px solid ${C.borderLight}` }}>
                  {r.map((v, ci) => (
                    <td key={ci} style={{ padding: '5px 8px', fontWeight: ci === 1 ? 600 : 400, color: v?.startsWith('→') ? C.amber : undefined, fontSize: 12 }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="规则表2：API600件号对应表" extra={<span style={{ fontSize: 12, color: C.textDim }}>牌2 · 件号→可换件</span>}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>给定件号，查对应行得到4个可换件材质</div>
        <DataTable
          columns={[
            { title: '件号', key: '号', render: v => <span style={{ fontWeight: 700, fontFamily: "'DM Mono',monospace", color: ['1#', '5#', '8#'].includes(v as string) ? C.accent : C.text }}>{v as string}</span> },
            { title: '阀瓣可换面', key: '阀瓣' },
            { title: '阀座可换面', key: '阀座' },
            { title: '阀杆', key: '阀杆' },
            { title: '填料压套', key: '压套' },
            { title: '常见名称', key: '名称', render: v => <Tag color={C.blue}>{v as string}</Tag> },
          ]}
          data={TRIM_TABLE as unknown as Record<string, unknown>[]}
          rowKey="号"
        />
        <div style={{ marginTop: 8, fontSize: 12, color: C.textDim, padding: '8px 0', borderTop: `1px solid ${C.borderLight}` }}>
          红色标记 = 2026年订单中最常用的3种配置，覆盖80%+订单量。HF = STL = 哈斯特合金堆焊。
        </div>
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════
// PAGE: 参数库
// ════════════════════════════════════════════════════

function PageParams({ params }: { params: Param[] }) {
  const [filter, setFilter] = useState({ 类型: '全部', search: '' })
  const types = ['全部', ...Array.from(new Set(params.map(p => p.类型)))]
  const filtered = params.filter(p => {
    if (filter.类型 !== '全部' && p.类型 !== filter.类型) return false
    if (filter.search && !JSON.stringify(p).includes(filter.search)) return false
    return true
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={filter.类型} onChange={e => setFilter(f => ({ ...f, 类型: e.target.value }))} style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }}>
          {types.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} placeholder="搜索..." style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, width: 180 }} />
        <span style={{ fontSize: 12, color: C.textDim }}>共 {filtered.length} 条</span>
      </div>
      <Card>
        <DataTable
          columns={[
            { title: '类型', key: '类型', render: v => <Tag color={C.tag[v as string] ?? C.blue}>{v as string}</Tag> },
            { title: 'DN', key: 'DN', render: v => <span style={{ fontFamily: "'DM Mono',monospace" }}>DN{v as number}</span> },
            { title: '压力', key: '压力', render: v => <span style={{ fontFamily: "'DM Mono',monospace" }}>{v as number}LB</span> },
            { title: '主体', key: '主体' },
            { title: '阀瓣阀闸', key: '阀瓣阀闸' },
            { title: '阀座', key: '阀座' },
            { title: '阀杆轴', key: '阀杆轴' },
            { title: '螺柱', key: '螺柱' },
            { title: '填料', key: '中腔填料' },
            { title: '件号', key: '件号', render: v => <Tag color={C.amber}>{v as string}</Tag> },
            { title: '次数', key: '次数', render: v => <span style={{ fontFamily: "'DM Mono',monospace", color: C.textDim }}>{v as number}</span> },
            { title: '数量', key: '数量', render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{v as number}</span> },
          ]}
          data={filtered as unknown as Record<string, unknown>[]}
        />
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════
// PAGE: 报价单列表 + 详情
// ════════════════════════════════════════════════════

function PageQuotes({ quotes, setPage }: { quotes: Quote[]; setPage: (p: PageState) => void }) {
  return (
    <Card title="报价单列表" extra={<Btn small onClick={() => setPage({ name: 'newQuote' })}>+ 新建报价</Btn>}>
      <DataTable
        columns={[
          { title: '订单号', key: '订单号', render: v => <span style={{ fontWeight: 700, color: C.blue }}>{v as string}</span> },
          { title: '客户', key: '客户' },
          { title: '日期', key: '日期' },
          { title: '台计', key: '台计', render: v => <span style={{ fontFamily: "'DM Mono',monospace" }}>{v as number}台</span> },
          { title: '状态', key: '状态', render: v => <Tag color={C.status[v as string] ?? C.textDim}>{v as string}</Tag> },
          { title: '明细', key: 'items', render: v => <span style={{ color: C.textDim }}>{(v as QuoteItem[]).length}行</span> },
          { title: '', key: 'id', render: (_, row) => <Btn variant="ghost" small onClick={() => setPage({ name: 'quoteDetail', data: row as unknown as Quote })}>查看</Btn> },
        ]}
        data={quotes as unknown as Record<string, unknown>[]}
      />
    </Card>
  )
}

function PageQuoteDetail({ quote, goBack }: { quote: Quote; goBack: () => void }) {
  const [expandIdx, setExpandIdx] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn variant="ghost" small onClick={goBack}>← 返回</Btn>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{quote.订单号}</h2>
        <Tag color={C.status[quote.状态] ?? C.textDim}>{quote.状态}</Tag>
        <span style={{ fontSize: 13, color: C.textDim }}>{quote.客户} · {quote.日期} · {quote.台计}台</span>
      </div>
      <Card title={`明细（${quote.items.length}行）`}>
        {quote.items.map((item, idx) => (
          <div key={idx} style={{ borderBottom: `1px solid ${C.borderLight}`, paddingBottom: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpandIdx(expandIdx === idx ? null : idx)}>
              <Tag color={C.tag[item.类型] ?? C.blue}>{item.类型}</Tag>
              <span style={{ fontWeight: 700 }}>{item.规格 || `DN${item.DN} ${item.压力}LB`}</span>
              <span style={{ color: C.textDim }}>× {item.数量}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: C.blue }}>{item.主体} · {item.阀瓣阀闸} · {item.阀座}</span>
              {item.件号 && <Tag color={C.amber}>{item.件号}</Tag>}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.textDim }}>{expandIdx === idx ? '▼' : '▶'}</span>
            </div>
            {expandIdx === idx && (
              <div style={{ marginTop: 8, padding: 10, background: '#fafaf7', borderRadius: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, fontSize: 12 }}>
                  {([['主体', item.主体], ['阀瓣阀闸', item.阀瓣阀闸], ['阀座', item.阀座], ['阀杆轴', item.阀杆轴], ['螺柱', item.螺柱], ['填料', item.中腔填料]] as [string, string][]).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: C.textLight }}>{k}</div>
                      <div style={{ fontWeight: 600 }}>{v || '-'}</div>
                    </div>
                  ))}
                </div>
                {quote.bomData?.[idx]?.bom && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textDim, marginBottom: 4 }}>BOM · {quote.bomData[idx].牌1} + {quote.bomData[idx].牌2}</div>
                    <DataTable
                      columns={[
                        { title: '#', key: '序号' },
                        { title: '零件', key: '零件', render: v => <span style={{ fontWeight: 600 }}>{v as string}</span> },
                        { title: '材质', key: '材质' },
                        { title: '来源', key: '来源', render: v => <Tag color={(v as string)?.includes('1') ? C.blue : C.amber}>{v as string}</Tag> },
                      ]}
                      data={quote.bomData[idx].bom as unknown as Record<string, unknown>[]}
                      rowKey="序号"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════
// PAGE: 首页 Dashboard
// ════════════════════════════════════════════════════

function PageDashboard({ params, quotes, setPage }: {
  params: Param[]
  quotes: Quote[]
  setPage: (p: PageState) => void
}) {
  const totalQty = params.reduce((s, p) => s + p.数量, 0)
  const byType = useMemo(() => {
    const m: Record<string, number> = {}
    params.forEach(p => { m[p.类型] = (m[p.类型] || 0) + p.数量 })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [params])
  const PIE = [C.blue, C.accent, C.green]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { val: params.length, label: '参数组合', color: C.blue },
          { val: totalQty.toLocaleString(), label: '历史总量', color: C.accent },
          { val: TRIM_TABLE.length, label: '件号规则', color: C.green },
          { val: quotes.length, label: '报价单', color: C.amber },
        ].map(({ val, label, color }) => (
          <Card key={label}>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'DM Mono',monospace" }}>{val}</div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card title="按类型分布">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}>
                {byType.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="快捷操作">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
            <Btn onClick={() => setPage({ name: 'newQuote' })} style={{ width: '100%', padding: '12px 16px', fontSize: 14 }}>+ 新建报价</Btn>
            <Btn variant="secondary" onClick={() => setPage({ name: 'rules' })} style={{ width: '100%' }}>查看规则库</Btn>
            <Btn variant="ghost" onClick={() => setPage({ name: 'params' })} style={{ width: '100%' }}>浏览参数库</Btn>
          </div>
        </Card>
      </div>

      <Card title="最近报价">
        <DataTable
          columns={[
            { title: '订单号', key: '订单号', render: v => <span style={{ fontWeight: 700, color: C.blue }}>{v as string}</span> },
            { title: '客户', key: '客户' },
            { title: '日期', key: '日期' },
            { title: '数量', key: '台计' },
            { title: '状态', key: '状态', render: v => <Tag color={C.status[v as string] ?? C.textDim}>{v as string}</Tag> },
          ]}
          data={quotes as unknown as Record<string, unknown>[]}
        />
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════════════════

const NAV = [
  { id: 'dashboard', icon: '◉', label: '首页', group: '' },
  { id: 'newQuote', icon: '⊕', label: '新建报价', group: '核心流程' },
  { id: 'quotes', icon: '☰', label: '报价单列表', group: '核心流程' },
  { id: 'params', icon: '⬡', label: '参数库', group: '数据管理' },
  { id: 'rules', icon: '☶', label: '规则库', group: '数据管理' },
]

export function ValveQuoteApp() {
  const [page, setPage] = useState<PageState>({ name: 'dashboard' })
  const [params] = useState<Param[]>(SEED_PARAMS)
  const [quotes, setQuotes] = useState<Quote[]>(SEED_QUOTES)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const r = localStorage.getItem('vq2-data')
      if (r) { const d = JSON.parse(r); if (d.quotes) setQuotes(d.quotes) }
    } catch { /* ignore */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem('vq2-data', JSON.stringify({ quotes })) } catch { /* ignore */ }
  }, [quotes, loaded])

  const renderPage = () => {
    switch (page.name) {
      case 'dashboard': return <PageDashboard params={params} quotes={quotes} setPage={setPage} />
      case 'newQuote': return <PageNewQuote params={params} setQuotes={setQuotes} setPage={setPage} />
      case 'quotes': return <PageQuotes quotes={quotes} setPage={setPage} />
      case 'quoteDetail': return <PageQuoteDetail quote={page.data} goBack={() => setPage({ name: 'quotes' })} />
      case 'params': return <PageParams params={params} />
      case 'rules': return <PageRules />
    }
  }

  let prevGroup = ''
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Noto Sans SC','Helvetica Neue',sans-serif", color: C.text, background: C.bg }}>
      {/* 侧边栏 */}
      <div style={{ width: 190, background: C.sidebar, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}><span style={{ color: C.accent }}>⬡</span> ValveQuote</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>阀门智能报价 v2.0</div>
        </div>
        <nav style={{ padding: '6px 0', flex: 1 }}>
          {NAV.map(n => {
            const active = page.name === n.id || (page.name === 'quoteDetail' && n.id === 'quotes')
            let groupLabel: string | null = null
            if (n.group && n.group !== prevGroup) { groupLabel = n.group; prevGroup = n.group }
            return (
              <div key={n.id}>
                {groupLabel && <div style={{ padding: '10px 14px 4px', fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{groupLabel}</div>}
                <div
                  onClick={() => setPage({ name: n.id } as PageState)}
                  style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, background: active ? C.sideActive : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: active ? 600 : 400, borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent' }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = C.sideHover }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{n.icon}</span>{n.label}
                </div>
              </div>
            )
          })}
        </nav>
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>产品方案 v1.0 · 超强阀门</div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            {NAV.find(n => n.id === page.name)?.label ?? (page.name === 'quoteDetail' ? '报价详情' : '')}
          </h1>
        </div>
        {renderPage()}
      </div>
    </div>
  )
}
