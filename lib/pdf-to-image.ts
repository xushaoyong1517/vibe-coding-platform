/**
 * Renders the first page of a PDF to a JPEG buffer using pdfjs-dist + @napi-rs/canvas.
 * All DOM polyfills are applied before the dynamic import to avoid issues.
 */

let pdfjsModule: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null

async function getPdfjs() {
  if (pdfjsModule) return pdfjsModule

  const { createCanvas, Path2D } = await import('@napi-rs/canvas')

  // Polyfill browser APIs required by pdfjs
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; is2D = true
      multiply() { return this }
      translate(x: number, y: number) { const m = new (globalThis.DOMMatrix as typeof DOMMatrix)(); m.e = x; m.f = y; return m }
      scale(x: number, y = x) { const m = new (globalThis.DOMMatrix as typeof DOMMatrix)(); m.a = x; m.d = y; return m }
      inverse() { return this }
    } as unknown as typeof DOMMatrix
  }
  if (typeof globalThis.DOMPoint === 'undefined') {
    globalThis.DOMPoint = class DOMPoint {
      constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
    } as unknown as typeof DOMPoint
  }

  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist/legacy/build/pdf.mjs')

  // Point worker to local file (avoids CDN fetch)
  const { fileURLToPath } = await import('url')
  const { join } = await import('path')
  const workerPath = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')
  mod.GlobalWorkerOptions.workerSrc = `file://${workerPath}`

  pdfjsModule = mod
  return mod
}

/**
 * Extracts all text from every page of the PDF, sorted by vertical position so
 * the reading order matches the visual layout (title block / BOM at bottom of
 * Chinese engineering drawings appears last in coordinates but we preserve it).
 * Returns empty string for scanned / image-only PDFs.
 */
export async function extractPdfText(pdfBytes: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfjs()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (pdfjs.getDocument as any)({
    data: new Uint8Array(pdfBytes.slice(0)), // slice so pdfjs doesn't detach the original
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = await (page as any).getTextContent()
    // Each item has { str, transform:[a,b,c,d,x,y] }; y is distance from bottom
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: { str: string; x: number; y: number }[] = content.items.map((it: any) => ({
      str: it.str as string,
      x: it.transform[4] as number,
      y: it.transform[5] as number,
    }))
    // Group into lines by rounding y to nearest 4 pts, then sort lines top→bottom
    const lineMap = new Map<number, string[]>()
    for (const it of items) {
      const key = Math.round(it.y / 4) * 4
      if (!lineMap.has(key)) lineMap.set(key, [])
      lineMap.get(key)!.push(it.str)
    }
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0]) // higher y = higher on page
      .map(([, strs]) => strs.join(' ').trim())
      .filter(Boolean)
    pages.push(lines.join('\n'))
  }
  return pages.join('\n--- 下一页 ---\n')
}

export async function pdfFirstPageToJpeg(pdfBytes: ArrayBuffer, scale = 2.0): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const pdfjs = await getPdfjs()

  class NodeCanvasFactory {
    create(w: number, h: number) {
      const canvas = createCanvas(w, h)
      return { canvas, context: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }
    }
    reset(obj: ReturnType<NodeCanvasFactory['create']>, w: number, h: number) {
      obj.canvas.width = w; obj.canvas.height = h
    }
    destroy(obj: ReturnType<NodeCanvasFactory['create']>) {
      (obj as { canvas: unknown }).canvas = null
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (pdfjs.getDocument as any)({
    data: new Uint8Array(pdfBytes.slice(0)), // slice so pdfjs doesn't detach the original
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    CanvasFactory: NodeCanvasFactory,
  }).promise

  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale })
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (page.render as any)({ canvasContext: ctx, viewport: vp }).promise

  return canvas.toBuffer('image/jpeg', 65)
}
