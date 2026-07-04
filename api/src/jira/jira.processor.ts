import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { Knex } from 'knex'
import { KNEX } from '../database/database.module'
import type { ProjectsService } from '../projects/projects.service'
import type { AiService } from './ai.service'
import type { JiraService } from './jira.service'

@Processor('jira-tasks', { concurrency: 2 })
export class JiraProcessor extends WorkerHost {
  private readonly logger = new Logger(JiraProcessor.name)

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly projects: ProjectsService,
    private readonly ai: AiService,
    private readonly jira: JiraService,
  ) {
    super()
  }

  async process(
    job: Job<{ errorId: number; projectId: number }>,
  ): Promise<void> {
    const { errorId, projectId } = job.data

    const error = await this.db('errors')
      .where({ id: errorId, project_id: projectId })
      .first()
    if (!error || error.jira_key) return

    const project = await this.projects.findById(projectId)
    if (!project || !project.ai_jira_enabled) return

    const occurrence = await this.db('error_occurrences')
      .where({ error_id: errorId })
      .orderBy('occurred_at', 'asc')
      .first()

    const task = await this.ai.generateJiraTask(error, occurrence ?? null)
    const jiraKey = await this.jira.createIssue(project, task, errorId)

    await this.db('errors').where({ id: errorId }).update({
      jira_key: jiraKey,
      status: 'triaged',
    })

    this.logger.log(
      `Created ${jiraKey} for error ${errorId} (project ${projectId})`,
    )
  }
}
