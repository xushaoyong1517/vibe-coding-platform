import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: '未配置 MOONSHOT_API_KEY' }, { status: 500 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '请求格式错误，需要 multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '未收到文件' }, { status: 400 })

  // 上传到 Moonshot Files API
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

  const { id: fileId } = await uploadRes.json()

  // 获取提取后的文字内容
  const contentRes = await fetch(`https://api.moonshot.cn/v1/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!contentRes.ok) {
    const err = await contentRes.text()
    return NextResponse.json({ error: `内容提取失败 ${contentRes.status}: ${err}` }, { status: 500 })
  }

  const text = await contentRes.text()

  // 异步删除，不影响响应
  fetch(`https://api.moonshot.cn/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {})

  return NextResponse.json({ text })
}
