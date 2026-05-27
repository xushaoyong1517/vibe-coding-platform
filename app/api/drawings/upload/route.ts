import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png':       'png',
  'image/jpeg':      'jpg',
  'image/svg+xml':   'svg',
}

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const id   = formData.get('id') as string | null
  if (!file || !id) return NextResponse.json({ error: '缺少文件或ID' }, { status: 400 })

  const contentType = file.type || 'application/pdf'
  const ext = EXT_MAP[contentType] ?? 'bin'
  const filename = `${id}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from('drawings')
    .upload(filename, bytes, { contentType, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filename)
  return NextResponse.json({ url: urlData.publicUrl })
}
