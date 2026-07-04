import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { AiService } from './ai.service'
import { JiraProcessor } from './jira.processor'
import { JiraService } from './jira.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'jira-tasks' }), ProjectsModule],
  providers: [AiService, JiraService, JiraProcessor],
})
export class JiraModule {}
