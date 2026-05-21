import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { Models } from '@/ai/constants'

export async function POST(req: Request) {
  const { system, message } = await req.json()

  try {
    const { text } = await generateText({
      ...getModelOptions(Models.AnthropicClaudeSonnet46),
      system,
      messages: [{ role: 'user', content: message }],
      maxOutputTokens: 2000,
    })
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json({ error: 'AI 调用失败，请检查 AI_GATEWAY_API_KEY 配置' }, { status: 500 })
  }
}
