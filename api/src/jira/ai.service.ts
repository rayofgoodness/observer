import { Injectable } from '@nestjs/common'

export interface GeneratedTask {
  summary: string
  description: string
  priority: 'Highest' | 'High' | 'Medium' | 'Low'
}

@Injectable()
export class AiService {
  async generateJiraTask(
    error: {
      message: string
      stack: string
      source: string
    },
    occurrence: {
      url: string
      route: string
      device: unknown
      app_version: string
    } | null,
  ): Promise<GeneratedTask> {
    const prompt = `You are a frontend tech lead triaging a production error from a Nuxt application.
Create a Jira task for the frontend team based on this error.

Error message: ${error.message}
Source: ${error.source}
Stack trace:
${error.stack.slice(0, 3000)}

Context of the first occurrence:
URL: ${occurrence?.url ?? 'unknown'}
Route: ${occurrence?.route ?? 'unknown'}
App version: ${occurrence?.app_version ?? 'unknown'}
Device: ${JSON.stringify(occurrence?.device ?? {})}

Respond with ONLY a valid JSON object, no markdown fences, no extra text:
{"summary": "concise task title, max 100 chars, starts with [Bug]", "description": "structured description: what happened, where, probable cause, suggested first debugging steps", "priority": "Highest" | "High" | "Medium" | "Low"}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Anthropic API error: ${response.status} ${await response.text()}`,
      )
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text: string }>
    }
    const text = (data.content ?? [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim()

    const parsed = JSON.parse(text) as GeneratedTask
    if (!parsed.summary || !parsed.description) {
      throw new Error('AI returned incomplete task payload')
    }
    return parsed
  }
}
