import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { supabase } from '@/lib/supabase'
import { getTenantId } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

let chineseFontCache: ArrayBuffer | null = null

async function getChineseFont(): Promise<ArrayBuffer | null> {
  if (chineseFontCache) return chineseFontCache
  try {
    const fontPath = join(process.cwd(), 'public', 'NotoSansCJKsc-Regular.otf')
    const buf = readFileSync(fontPath)
    const ab = new ArrayBuffer(buf.length)
    new Uint8Array(ab).set(buf)
    chineseFontCache = ab
    return chineseFontCache
  } catch {
    return null
  }
}

function hasChinese(str: string) { return /[一-鿿]/.test(str) }

async function buildPdf(id: string, tenantId: string, fields: Record<string, string>, preview: boolean): Promise<NextResponse> {
  const { data: tpl, error: tplErr } = await supabase
    .from('drawing_templates')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  if (tplErr || !tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })
  if (!tpl.pdf_url) return NextResponse.json({ error: '该模板尚未上传PDF' }, { status: 400 })

  const pdfRes = await fetch(tpl.pdf_url)
  if (!pdfRes.ok) return NextResponse.json({ error: 'PDF文件下载失败' }, { status: 500 })
  const pdfBytes = await pdfRes.arrayBuffer()

  const pdfDoc = await PDFDocument.load(pdfBytes)
  pdfDoc.registerFontkit(fontkit)

  const chineseFontBytes = await getChineseFont()
  const chineseFont = chineseFontBytes ? await pdfDoc.embedFont(chineseFontBytes) : null
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const fieldDefs: Array<{
    key: string; page: number; x: number; y: number; size: number
    coverW?: number; coverH?: number
  }> = tpl.pdf_fields ?? []

  const pages = pdfDoc.getPages()

  for (const field of fieldDefs) {
    const text = fields[field.key]
    if (text == null) continue
    const page = pages[(field.page ?? 1) - 1]
    if (!page) continue

    if (field.coverW && field.coverH) {
      page.drawRectangle({ x: field.x, y: field.y, width: field.coverW, height: field.coverH, color: rgb(1, 1, 1) })
    }

    const font = hasChinese(text) && chineseFont ? chineseFont : latinFont
    page.drawText(text, { x: field.x, y: field.y + 2, size: field.size ?? 9, font, color: rgb(0, 0, 0) })
  }

  const filledBytes = await pdfDoc.save()
  const encodedName = encodeURIComponent(tpl.name + '-客户版.pdf')
  return new NextResponse(Buffer.from(filledBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': preview
        ? `inline; filename*=UTF-8''${encodedName}`
        : `attachment; filename*=UTF-8''${encodedName}`,
    },
  })
}

// GET：query 参数填充，浏览器直接在新 Tab 显示 PDF（不需要 blob）
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const preview = url.searchParams.get('mode') !== 'download'
    const fields: Record<string, string> = {}
    url.searchParams.forEach((v, k) => { if (k !== 'mode') fields[k] = v })
    return await buildPdf(id, getTenantId(req), fields, preview)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fill GET] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST：JSON body 填充（保留兼容）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const preview = url.searchParams.get('mode') === 'preview'
    const body = await req.json() as Record<string, string>
    return await buildPdf(id, getTenantId(req), body, preview)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fill POST] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
