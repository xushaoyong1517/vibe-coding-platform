import { NextResponse } from 'next/server'

const PART_CODE: Record<string, string> = {
  '阀座':    'YQFM/J01-02',
  '垫片':    'YQFM/J01-15',
  '填料':    'YQFM/J01-14',
  '螺柱':    'YQFM/J01-15',
  '螺栓':    'YQFM/J01-15',
  '螺母':    'GB/T6175-2016',
  '上密封座': 'YQFM/J01-02',
  '填料压套': 'YQFM/J01-03',
  '填料压板': 'YQFM/J01-04',
  '阀杆螺母': 'YQFM/J01-06',
  '手轮':    'YQFM/J01-09',
  '油杯':    'JB/T7940.1-1995',
  '销轴':    'GB/T119.1-2000',
  '活接螺栓': 'YQFM/J01-16',
  '锁紧螺母': 'YQFM/J01-11',
}

interface BOMRow   { 序号: number; 零件: string; 材质: string; 数量: number }
interface QuoteItem { 类型: string; DN: number; 压力: number; 数量: number; 驱动: string; 主体: string; 工厂编号?: string }
interface BOMResult { item: QuoteItem; bom: BOMRow[]; 牌1: string; 牌2: string }
interface Quote { id: string; 客户: string; 订单号: string; 日期: string; bomData?: BOMResult[] }

function bomSheet(quote: Quote, result: BOMResult, idx: number): string {
  const { item, bom, 牌1, 牌2 } = result
  const docNo = item.工厂编号 || `${quote.订单号}-${String(idx + 1).padStart(2, '0')}`

  const rows = bom.map((r, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td class="s">${PART_CODE[r.零件] ?? ''}</td>
    <td>${r.零件}</td>
    <td class="s"></td>
    <td>${r.材质}</td>
    <td class="c">${r.数量 ?? 1}</td>
    <td class="c"></td><td class="c"></td>
    <td></td>
  </tr>`).join('')

  const blankCount = Math.max(0, 25 - bom.length)
  const blankH = blankCount > 0 ? `style="height:${Math.floor(62 / blankCount)}mm"` : ''
  const blanks = Array.from({ length: blankCount },
    () => `<tr ${blankH}><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join('')

  return `<div class="page">
    <div class="hd">
      <span class="co">越强阀门有限公司</span>
      <span class="dt">明&nbsp;细&nbsp;表</span>
    </div>
    <table class="bt">
      <thead><tr class="th">
        <th style="width:26px">序号</th><th style="width:88px">代号</th>
        <th style="width:72px">名称</th><th style="width:68px">规格</th>
        <th>材料</th><th style="width:34px">数量</th>
        <th style="width:40px">单件kg</th><th style="width:40px">总重kg</th>
        <th style="width:48px">备注</th>
      </tr></thead>
      <tbody>${rows}${blanks}</tbody>
    </table>
    <table class="ft">
      <tr>
        <td class="fl">设计</td><td class="fv"></td>
        <td class="fl">标准化</td><td class="fv"></td>
        <td rowspan="4" class="fc">越强阀门有限公司</td>
      </tr>
      <tr><td class="fl">校对</td><td class="fv"></td><td class="fl">审定</td><td class="fv"></td></tr>
      <tr><td class="fl">审核</td><td class="fv"></td><td class="fl">批准</td><td class="fv"></td></tr>
      <tr><td class="fl">工艺</td><td class="fv"></td><td class="fl">日期</td><td class="fv">${quote.日期}</td></tr>
      <tr>
        <td class="fl">客户</td><td colspan="3" class="fv">${quote.客户}</td>
        <td class="fn">${docNo}</td>
      </tr>
      <tr>
        <td class="fl">订单</td><td colspan="3" class="fv">${quote.订单号}</td>
        <td class="fl" style="font-size:9px">${item.类型} DN${item.DN} ${item.压力}LB · ${item.数量}台</td>
      </tr>
    </table>
    <div class="tag">${item.类型} · DN${item.DN} · ${item.压力}LB · ${item.驱动} · ${牌1.split('（')[0]} · ${牌2}</div>
  </div>`
}

// POST：前端直接传 quote JSON，避免从数据库查
export async function POST(req: Request) {
  const quote = await req.json() as Quote
  if (!quote?.bomData?.length) {
    return NextResponse.json({ error: '该报价单尚无 BOM 数据，请先生成 BOM' }, { status: 400 })
  }

  const sheets = quote.bomData.map((r, i) => bomSheet(quote, r, i)).join('\n')

  const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"/>
<title>${quote.订单号} BOM 明细</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"SimSun","宋体","Microsoft YaHei",sans-serif;font-size:11px;background:#e0e0e0;padding:20px;display:flex;flex-direction:column;align-items:center;gap:20px}
.np{background:#fff;padding:10px 20px;border-radius:6px;display:flex;gap:12px;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.page{width:210mm;background:#fff;border:1px solid #999;padding:7mm 7mm 4mm 7mm;display:flex;flex-direction:column}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:4px;margin-bottom:5px}
.co{font-size:17px;font-weight:900;letter-spacing:2px}
.dt{font-size:13px;font-weight:700;color:#444}
.bt{width:100%;border-collapse:collapse;flex:1}
.bt th,.bt td{border:.5px solid #777;padding:2px 4px;font-size:10.5px;line-height:1.5}
.th th{background:#f0f0f0;font-weight:700;text-align:center}
.c{text-align:center}.s{font-size:9px;color:#666}
.ft{width:100%;border-collapse:collapse;margin-top:3px}
.ft td{border:.5px solid #777;padding:2.5px 5px;font-size:10px;height:17px}
.fl{background:#f5f5f5;font-weight:600;width:38px;text-align:center;color:#555}
.fv{width:76px}.fc{text-align:center;font-size:13px;font-weight:800;letter-spacing:1px}
.fn{text-align:center;font-size:10.5px;font-weight:700;font-family:monospace}
.tag{margin-top:4px;font-size:9.5px;color:#999;text-align:right}
@media print{
  body{background:#fff;padding:0;gap:0}
  .np{display:none!important}
  .page{border:none;page-break-after:always;padding:5mm}
  .page:last-child{page-break-after:auto}
  @page{size:A4 portrait;margin:8mm}
}
</style></head><body>
<div class="np">
  <span style="font-size:13px;font-weight:600">${quote.订单号} · ${quote.客户} · ${quote.bomData.length} 张明细</span>
  <button onclick="window.print()" style="padding:6px 18px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">打印 / 导出PDF</button>
  <span style="font-size:11px;color:#888">A4 纵向 · 每台阀门独立一页</span>
</div>
${sheets}
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
