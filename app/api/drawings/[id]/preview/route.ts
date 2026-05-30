import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'

interface BOMRow   { seq: number; name: string; material: string }
interface DimRow   { nps: string; dn: number; L: number; D: number; D1: number; H: number; W: number; Wt: number }
interface PerfParams { pressure: string; shellTest: string; sealTest: string; tempRange: string; medium: string }

function buildHtml(tpl: {
  name: string
  bom_data: BOMRow[]
  dim_data: DimRow[]
  image_url?: string
  tech_cond: string[]
  perf_params: PerfParams
}, fill: { 客户?: string; 日期?: string; 订单号?: string; DN?: number; 主体?: string; 阀杆?: string }) {
  const { bom_data, dim_data, image_url, tech_cond, perf_params } = tpl
  const currentDN = fill.DN ?? 0

  const bomRows = bom_data.map(r => `
    <tr>
      <td class="c">${r.seq}</td>
      <td>${r.name}</td>
      <td style="color:#1548a8">${r.material}</td>
    </tr>`).join('')

  const dimRows = dim_data.map(r => {
    const hi = r.dn === currentDN
    return `<tr${hi ? ' class="hi"' : ''}>
      <td class="c">${r.nps}</td>
      <td class="c">${r.dn}</td>
      <td class="c">${r.L}</td>
      <td class="c">${r.D}</td>
      <td class="c">${r.D1}</td>
      <td class="c">${r.H}</td>
      <td class="c">${r.W}</td>
      <td class="c">${r.Wt}</td>
    </tr>`}).join('')

  const techList = tech_cond.map((t, i) =>
    `<div class="ti"><span class="tn">${i + 1}.</span><span>${t}</span></div>`).join('')

  const imgBlock = image_url
    ? `<img src="${image_url}" style="max-width:100%;max-height:100%;object-fit:contain;display:block" />`
    : `<div class="no-img">请在小样图库上传图纸图片</div>`

  const vField = (v?: string | number, fallback = '') =>
    `<span class="ff">${v ?? fallback}</span>`

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<title>${tpl.name} - 小样图</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Microsoft YaHei","微软雅黑","PingFang SC",sans-serif;font-size:11px;background:#ccc;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px}
.np{background:#fff;padding:8px 16px;border-radius:6px;display:flex;gap:12px;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.15)}

/* 用 gap+背景色 做格线，彻底告别每格独立 border 造成的黑框 */
.page{
  width:420mm;min-height:297mm;background:#fff;
  outline:1px solid #999;           /* 外框只有1条，不叠加 */
  display:grid;
  grid-template-columns:1fr 72mm;
  grid-template-rows:auto 1fr auto auto;
  gap:1px;                          /* 格线=背景色透出的1px */
  background:#bbb;                  /* 格线颜色 */
}
.cell{background:#fff;overflow:hidden}

/* 技术条件 */
.tech{padding:6px 10px}
.th{font-weight:800;font-size:12px;text-align:center;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #ccc;letter-spacing:4px}
.ti{display:flex;gap:4px;line-height:1.8;font-size:10.5px}
.tn{color:#888;min-width:14px;flex-shrink:0}

/* 性能规范 */
.perf-wrap{padding:6px 8px}
.perf-title{font-weight:800;font-size:12px;text-align:center;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #ccc;letter-spacing:2px}
.pt{width:100%;border-collapse:collapse;font-size:10.5px}
.pt td{border:.5px solid #e0e0e0;padding:3.5px 6px;line-height:1.5}
.pt .h{background:#f4f7ff;font-weight:700;text-align:center;font-size:10px;letter-spacing:1px;color:#1548a8}
.pt .l{color:#666;white-space:nowrap;width:52px}
.pt .v{font-weight:700;color:#111}

/* 图纸区 */
.drawing{padding:8px;display:flex;align-items:center;justify-content:center;grid-row:2/4}
.no-img{display:flex;align-items:center;justify-content:center;height:100%;color:#bbb;font-size:12px;border:1px dashed #ddd;border-radius:4px;padding:20px;text-align:center}

/* BOM */
.bom{grid-row:2/4}
.bom table{width:100%;border-collapse:collapse;font-size:10px}
.bom th{background:#f4f7ff;font-size:10px;padding:3px 4px;border:.5px solid #ddd;text-align:center;font-weight:700;color:#1548a8}
.bom td{padding:2.5px 5px;border:.5px solid #eee;line-height:1.5}
.c{text-align:center}

/* 尺寸表 */
.dims table{width:100%;border-collapse:collapse;font-size:10px}
.dims th{background:#f4f7ff;font-size:9.5px;padding:3px 4px;border:.5px solid #ddd;text-align:center;font-weight:700;color:#1548a8}
.dims td{padding:2.5px 4px;border:.5px solid #eee}
tr.hi td{background:#fffbe6;font-weight:700;color:#b45309}

/* 标题栏 */
.tb{padding:0}
.tb table{width:100%;border-collapse:collapse;height:100%}
.tb td{border:.5px solid #e0e0e0;padding:4px 8px;font-size:10.5px;vertical-align:middle}
.lb{font-size:9px;color:#999;display:block;margin-bottom:1px}
.ff{color:#1548a8;border-bottom:1px dashed #1548a8;min-width:40px;display:inline-block;font-weight:600}
.big{font-size:17px;font-weight:900;text-align:center;letter-spacing:2px}

@media print{
  body{background:#fff;padding:0;gap:0}
  .np{display:none!important}
  /* 打印：外框去掉，格线颜色换成极浅灰 */
  .page{outline:none;background:#e8e8e8;gap:.5px}
  .cell{background:#fff}
  .th,.perf-title{border-bottom-color:#ccc}
  .pt td,.bom th,.bom td,.dims th,.dims td,.tb td{border-color:#ddd!important}
  .bom th,.dims th,.pt .h{
    background:#f5f5f5!important;color:#000!important;
    -webkit-print-color-adjust:exact;print-color-adjust:exact
  }
  tr.hi td{background:#fffbe6!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ff{border-bottom:none!important;color:#000!important}
  @page{size:A3 landscape;margin:8mm}
}
</style>
</head>
<body>

<div class="np">
  <span style="font-size:13px;font-weight:600">${tpl.name}</span>
  <button onclick="window.print()" style="padding:6px 18px;background:#1548a8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">打印 / 导出PDF</button>
  <span style="font-size:11px;color:#888">A3 横向</span>
</div>

<div class="page">

  <!-- 技术条件（左上） -->
  <div class="cell tech">
    <div class="th">技 术 条 件</div>
    ${techList}
  </div>

  <!-- 性能规范（右上） -->
  <div class="cell perf-wrap">
    <div class="perf-title">性 能 规 范</div>
    <table class="pt">
      <tr><td class="h" colspan="2">基本参数</td></tr>
      <tr><td class="l">公称压力</td><td class="v">${perf_params.pressure}</td></tr>
      <tr><td class="l">适用介质</td><td class="v">${perf_params.medium}</td></tr>
      <tr><td class="l">温度范围</td><td class="v">${perf_params.tempRange}</td></tr>
      <tr><td class="h" colspan="2">试验压力（MPa）</td></tr>
      <tr><td class="l">壳体试验</td><td class="v">${perf_params.shellTest}</td></tr>
      <tr><td class="l">密封试验</td><td class="v">${perf_params.sealTest}</td></tr>
    </table>
  </div>

  <!-- 图纸（左中+左下） -->
  <div class="cell drawing">
    ${imgBlock}
  </div>

  <!-- BOM（右中+右下共用右列） -->
  <div class="cell bom">
    <table>
      <thead>
        <tr>
          <th style="width:20px">序</th>
          <th>名称</th>
          <th>材料</th>
        </tr>
      </thead>
      <tbody>${bomRows}</tbody>
    </table>
  </div>

  <!-- 尺寸表（左下） -->
  <div class="cell dims">
    <table>
      <thead>
        <tr>
          <th>NPS</th><th>DN</th><th>L</th><th>D</th><th>D₁</th><th>H</th><th>W</th><th>Wt(kg)</th>
        </tr>
      </thead>
      <tbody>${dimRows}</tbody>
    </table>
  </div>

  <!-- 标题栏（右下） -->
  <div class="cell tb">
    <table>
      <tr>
        <td><span class="lb">客户</span>${vField(fill.客户)}</td>
        <td><span class="lb">日期</span>${vField(fill.日期)}</td>
      </tr>
      <tr>
        <td><span class="lb">订单号</span>${vField(fill.订单号)}</td>
        <td><span class="lb">规格</span>${vField(currentDN ? `DN${currentDN}` : '')}</td>
      </tr>
      <tr><td colspan="2" class="big">${tpl.name.split(' ').pop() ?? tpl.name}</td></tr>
      <tr>
        <td><span class="lb">设计</span>—</td>
        <td><span class="lb">校对</span>—</td>
      </tr>
    </table>
  </div>

</div>
</body>
</html>`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const fill = {
    客户:  url.searchParams.get('客户')  ?? undefined,
    日期:  url.searchParams.get('日期')  ?? undefined,
    订单号: url.searchParams.get('订单号') ?? undefined,
    DN:    url.searchParams.get('DN') ? Number(url.searchParams.get('DN')) : undefined,
    主体:  url.searchParams.get('主体')  ?? undefined,
    阀杆:  url.searchParams.get('阀杆')  ?? undefined,
  }

  const { data: tpl, error } = await supabase
    .from('drawing_templates')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', getTenantId(req))
    .single()

  if (error || !tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })

  const html = buildHtml({
    name:        tpl.name,
    bom_data:    tpl.bom_data   ?? [],
    dim_data:    tpl.dim_data   ?? [],
    image_url:   tpl.image_url  ?? undefined,
    tech_cond:   tpl.tech_cond  ?? [],
    perf_params: tpl.perf_params ?? { pressure: '', shellTest: '', sealTest: '', tempRange: '', medium: '' },
  }, fill)

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
