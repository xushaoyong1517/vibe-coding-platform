import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { pdfFirstPageToJpeg, extractPdfText } from '@/lib/pdf-to-image'
import { computeDrawingCodes } from '@/lib/drawing-codes'

const SYSTEM_PROMPT_BASE = `你是阀门工程图纸解析专家。从提供的图纸信息中提取结构化信息，严格以JSON格式返回，不包含任何其他文字。

返回格式：
{
  "name": "图纸完整名称，如 Z40H-150LB 闸阀手轮",
  "valve_type": "阀门类型，只能是：闸阀/截止阀/止回阀/球阀/蝶阀 之一",
  "pressure": 150,
  "actuator": "驱动方式，只能是：手轮/伞齿轮/电动/气动 之一",
  "dn_min": 50,
  "dn_max": 600,
  "description": "简要描述，包含设计标准、适用介质、结构特点（100字以内）",
  "rules": "约束规则，如DN范围建议、特殊工况要求等（可为空字符串）",
  "bom_template": [
    {"零件": "阀体", "材质": "WCB", "数量": 1},
    {"零件": "阀座", "材质": "13Cr", "数量": 2}
  ]
}

## BOM提取规则（严格执行）
1. 先确认明细表的总行数N，**bom_template数组长度必须精确等于N**
2. 中国工程图纸明细表序号1在底部、序号N在顶部，请按序号1→N的顺序填入数组
3. **严格只提取实际存在的行，绝对不得凭推测增加不存在的零件行**
4. **每个零件名称只出现一次**，重复出现说明是误读，跳过后续重复项
5. 每个元素只有三个字段：零件、材质、数量；材质为空填 ""
6. 数量直接按图纸填写，不要修改原始数字

## 材质说明
请填写图纸中的实际材质，服务端会自动替换占位符。`

const TEXT_USER_MSG = (text: string) =>
  `以下是从工程图纸PDF中提取的全部文字内容，请从中找出零件明细表（BOM），按要求输出JSON。\n\n${text}`

const VISION_USER_MSG = '请仔细识别图纸中的零件明细表（BOM表），按要求提取所有零件信息，输出JSON。'

// Minimum characters to consider text extraction successful
const TEXT_MIN_CHARS = 200

type BOMRow = { 零件: string; 材质: string; 数量: number | string }

const DRIVE_PARTS = ['手轮', '伞齿轮', '电动装置', '气动装置', '蜗轮', '蜗杆']
const FASTENER_RE = /螺[栓柱母]|六角|螺钉/

function postProcessBom(rows: BOMRow[]): BOMRow[] {
  // 1. 如果第一行是驱动件（手轮/伞齿轮等），说明顺序是反的，翻转
  if (rows.length > 1 && DRIVE_PARTS.some(d => rows[0].零件.includes(d))) {
    rows = [...rows].reverse()
  }

  // 2. 去重：同名零件只保留第一次出现的
  const seen = new Set<string>()
  rows = rows.filter(r => {
    if (!r.零件 || seen.has(r.零件)) return false
    seen.add(r.零件)
    return true
  })

  // 产出骨架：保留图上参考材质（derive 用 buildBomFromSkeleton 按牌1/牌2 规则重填，
  // 不再写 {{占位符}}）；螺栓/螺母数量按DN。
  return rows.map(r => ({
    零件: r.零件,
    材质: r.材质,                                   // 参考材质（规则会覆盖）
    数量: FASTENER_RE.test(r.零件) ? '按DN' : r.数量,
  }))
}

function normalizeBom(raw: unknown): BOMRow[] {
  if (!Array.isArray(raw)) return []
  const rows = (raw as Record<string, unknown>[]).map(r => ({
    零件: String(r['零件'] ?? r['名称'] ?? r['name'] ?? ''),
    材质: String(r['材质'] ?? r['material'] ?? ''),
    数量: (r['数量'] ?? r['qty'] ?? 1) as number | string,
  }))
  return postProcessBom(rows)
}

async function callMoonshotText(apiKey: string, userMsg: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'moonshot-v1-32k',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BASE },
        { role: 'user', content: userMsg },
      ],
    }),
  })
  if (!res.ok) throw new Error(`moonshot text ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  console.log('[parse] text model reply preview:', text.slice(0, 400))
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(jsonStr)
}

async function callMoonshotVision(apiKey: string, imageBase64: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'moonshot-v1-32k-vision-preview',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BASE },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: 'text', text: VISION_USER_MSG },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`moonshot vision ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  console.log('[parse] vision reply preview:', text.slice(0, 400))
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(jsonStr)
}

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const id = (formData.get('id') as string | null) ?? ('d' + Date.now())

  if (!file) return NextResponse.json({ error: '缺少文件' }, { status: 400 })

  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: '未配置 MOONSHOT_API_KEY' }, { status: 500 })

  const bytes = await file.arrayBuffer()

  // Step 1: Upload to Supabase storage
  let pdfUrl: string | null = null
  const { error: storErr } = await supabase.storage
    .from('drawings')
    .upload(`${id}.pdf`, bytes, { contentType: 'application/pdf', upsert: true })
  if (!storErr) {
    pdfUrl = supabase.storage.from('drawings').getPublicUrl(`${id}.pdf`).data.publicUrl
  }

  // Step 2: Try text extraction first (fast, accurate for CAD-generated PDFs)
  let parsed: Record<string, unknown> = {}
  let usedMethod = 'none'

  try {
    const pdfText = await extractPdfText(bytes)
    console.log('[parse] extracted text length:', pdfText.length, 'chars')

    if (pdfText.length >= TEXT_MIN_CHARS) {
      // Text-based PDF — use text model (most accurate)
      console.log('[parse] using text model')
      parsed = await callMoonshotText(apiKey, TEXT_USER_MSG(pdfText))
      usedMethod = 'text'
    } else {
      console.log('[parse] text too short, falling back to vision')
    }
  } catch (e) {
    console.error('[parse] text extraction / text model failed:', e)
  }

  // Step 3: Fall back to vision model for scanned PDFs
  if (usedMethod === 'none') {
    try {
      const jpegBuf = await pdfFirstPageToJpeg(bytes, 2.5)
      const imageBase64 = jpegBuf.toString('base64')
      console.log('[parse] rendered PDF page, jpeg size:', jpegBuf.length, 'bytes')
      parsed = await callMoonshotVision(apiKey, imageBase64)
      usedMethod = 'vision'
    } catch (e) {
      console.error('[parse] vision failed:', e)
      return NextResponse.json({ pdf_url: pdfUrl, _warn: 'PDF解析失败，请手动填写信息' })
    }
  }

  // Step 4: Normalize BOM
  if (Array.isArray(parsed.bom_template)) {
    parsed.bom_template = normalizeBom(parsed.bom_template)

    // 从BOM最后一行（驱动件）自动推断 actuator
    const bom = parsed.bom_template as BOMRow[]
    const lastPart = bom[bom.length - 1]?.零件 ?? ''
    if (lastPart.includes('伞齿轮') || lastPart.includes('蜗轮')) parsed.actuator = '伞齿轮'
    else if (lastPart.includes('电动')) parsed.actuator = '电动'
    else if (lastPart.includes('气动')) parsed.actuator = '气动'
    else if (lastPart.includes('手轮')) parsed.actuator = '手轮'
  }

  // Step 5: 归一码（与明细行/历史行同一套键，供 BOM 骨架匹配）
  const codes = computeDrawingCodes(
    String(parsed.name ?? ''), parsed.valve_type as string | undefined,
    parsed.pressure as number | undefined, parsed.actuator as string | undefined,
  )

  console.log('[parse] done, method:', usedMethod, 'bom rows:', (parsed.bom_template as unknown[])?.length ?? 0, 'codes:', JSON.stringify(codes))
  return NextResponse.json({ ...parsed, codes, pdf_url: pdfUrl, _method: usedMethod })
}
