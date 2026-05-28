import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: '请在 .env.local 中配置 MOONSHOT_API_KEY' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: '缺少 file 字段' }, { status: 400 })
  }

  // 1. 上传文件到 Moonshot Files API
  const uploadForm = new FormData()
  uploadForm.append('file', file)
  uploadForm.append('purpose', 'file-extract')

  const uploadRes = await fetch('https://api.moonshot.cn/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: uploadForm,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    return NextResponse.json({ error: `文件上传失败 ${uploadRes.status}: ${err}` }, { status: 500 })
  }

  const uploaded = await uploadRes.json()
  const fileId = uploaded.id
  if (!fileId) {
    return NextResponse.json({ error: '文件上传未返回 ID' }, { status: 500 })
  }

  // 2. 获取提取的文字内容
  const contentRes = await fetch(`https://api.moonshot.cn/v1/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!contentRes.ok) {
    const err = await contentRes.text()
    return NextResponse.json({ error: `文字提取失败 ${contentRes.status}: ${err}` }, { status: 500 })
  }

  const extracted = await contentRes.json()
  const text = extracted.content ?? ''

  // 3. 删除已上传的文件（清理）
  fetch(`https://api.moonshot.cn/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {})

  return NextResponse.json({ text })
}
