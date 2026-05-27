import { NextResponse } from 'next/server'
import paramExtractCorePrompt from './skills/param-extract-core.md'
import paramExtractApiPrompt from './skills/param-extract-api.md'
import paramExtractGbPrompt from './skills/param-extract-gb.md'
import bomGeneratePrompt from './skills/bom-generate.md'

function buildParamExtractPrompt(message: string | undefined): string {
  const hasGb = /\bgb\b|gb\/t|pn\d{2,}/i.test(message ?? '')
  const parts = [paramExtractCorePrompt, paramExtractApiPrompt]
  if (hasGb) parts.push(paramExtractGbPrompt)
  return parts.join('\n\n---\n\n')
}

export async function POST(req: Request) {
  const body = await req.json()
  const { skill, message, imageBase64, imageMime } = body

  let system: string
  if (skill === 'param-extract') {
    system = buildParamExtractPrompt(message)
  } else if (skill === 'bom-generate') {
    system = bomGeneratePrompt
  } else {
    return NextResponse.json({ error: `未知 skill: ${skill}` }, { status: 400 })
  }

  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: '请在 .env.local 中配置 MOONSHOT_API_KEY' }, { status: 500 })
  }

  // 图片模式：使用视觉模型，content 为多模态数组
  const isVision = Boolean(imageBase64)
  const userContent = isVision
    ? [
        { type: 'image_url', image_url: { url: `data:${imageMime ?? 'image/png'};base64,${imageBase64}` } },
        { type: 'text', text: message || '请从图片中识别阀门参数，按要求输出JSON。' },
      ]
    : message

  const payload = JSON.stringify({
    model: isVision ? 'moonshot-v1-8k-vision-preview' : 'moonshot-v1-32k',
    max_tokens: skill === 'bom-generate' ? 4000 : 2000,
    ...(!isVision && { response_format: { type: 'json_object' } }),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  })

  const MAX_RETRIES = 3
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: payload,
      })

      // 429 过载：等待后重试
      if (res.status === 429) {
        const wait = attempt * 3000
        console.warn(`[claude] 429 overloaded, retry ${attempt}/${MAX_RETRIES} after ${wait}ms`)
        if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, wait)); continue }
        return NextResponse.json({ error: 'Kimi 服务繁忙，请稍候几秒再试' }, { status: 429 })
      }

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `Kimi API 错误 ${res.status}: ${err}` }, { status: 500 })
      }

      const data = await res.json()
      if (data.error) {
        console.error('[claude] business error:', JSON.stringify(data.error))
        return NextResponse.json({ error: `Kimi 错误: ${data.error.message ?? JSON.stringify(data.error)}` }, { status: 500 })
      }

      const choice = data.choices?.[0]
      const text = choice?.message?.content ?? ''
      console.log('[claude]', skill, `attempt=${attempt}`, '| finish_reason:', choice?.finish_reason, '| reply:', text.slice(0, 200))

      if (!text) {
        lastError = 'AI 返回内容为空'
        if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 2000)); continue }
        return NextResponse.json({ error: `${lastError}，请稍后重试` }, { status: 500 })
      }

      return NextResponse.json({ text })

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 2000)); continue }
    }
  }

  return NextResponse.json({ error: `请求失败: ${lastError}` }, { status: 500 })
}
