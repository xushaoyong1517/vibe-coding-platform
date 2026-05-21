import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { Models } from '@/ai/constants'
import paramExtractPrompt from './skills/param-extract.md'
import bomGeneratePrompt from './skills/bom-generate.md'

const SKILLS: Record<string, string> = {
  'param-extract': paramExtractPrompt,
  'bom-generate': bomGeneratePrompt,
}

export async function POST(req: Request) {
  const { skill, message } = await req.json()

  const system = SKILLS[skill as string]
  if (!system) {
    return NextResponse.json({ error: `未知 skill: ${skill}` }, { status: 400 })
  }

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
