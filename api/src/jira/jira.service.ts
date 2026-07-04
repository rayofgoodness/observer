import { Injectable } from '@nestjs/common'
import { decrypt } from '../common/crypto.util'
import type { Project } from '../projects/projects.service'
import type { GeneratedTask } from './ai.service'

@Injectable()
export class JiraService {
  async createIssue(
    project: Project,
    task: GeneratedTask,
    errorId: number,
  ): Promise<string> {
    if (
      !project.jira_base_url ||
      !project.jira_email ||
      !project.jira_api_token_encrypted ||
      !project.jira_project_key
    ) {
      throw new Error(`Project ${project.id} has incomplete Jira configuration`)
    }

    const token = decrypt(project.jira_api_token_encrypted)
    const auth = Buffer.from(`${project.jira_email}:${token}`).toString(
      'base64',
    )
    const descriptionText = `${task.description}\n\nError Tracker ID: ${errorId}`

    const response = await fetch(`${project.jira_base_url}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: project.jira_project_key },
          issuetype: { name: 'Bug' },
          summary: task.summary.slice(0, 255),
          priority: { name: task.priority },
          labels: ['auto-error-tracker'],
          description: {
            type: 'doc',
            version: 1,
            content: descriptionText.split('\n\n').map((paragraph) => ({
              type: 'paragraph',
              content: [{ type: 'text', text: paragraph || ' ' }],
            })),
          },
        },
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Jira API error: ${response.status} ${await response.text()}`,
      )
    }

    const data = (await response.json()) as { key: string }
    return data.key
  }
}
