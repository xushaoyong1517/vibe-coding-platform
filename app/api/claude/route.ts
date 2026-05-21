import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import paramExtractPrompt from './skills/param-extract.md'
import bomGeneratePrompt from './skills/bom-generate.md'

const SKILLS: Record<string, string> = {
  'param-extract': paramExtractPrompt,
  'bom-generate': bomGeneratePrompt,
}

const kimi = createOpenAI({
  baseURL: 'https://api.moonshot.cn/v1',
  apiKey: process.env.MOONSHOT_API_KEY || '',
})

export async function POST(req: Request) {
  const { skill, message } = await req.json()

  const system = SKILLS[skill as string]
  if (!system) {
    return NextResponse.json({ error: `未知 skill: ${skill}` }, { status: 400 })
  }

  if (!process.env.MOONSHOT_API_KEY) {
    return NextResponse.json({ error: '请在 .env 文件中配置 MOONSHOT_API_KEY' }, { status: 500 })
  }

  try {
    const { text } = await generateText({
      model: kimi('kimi-latest'),
      system,
      messages: [{ role: 'user', content: message }],
      maxOutputTokens: 2000,
    })
    return NextResponse.json({ text })
  } catch (error) {
    console.error('Kimi API error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `AI 调用失败: ${msg}` }, { status: 500 })
  }
}
