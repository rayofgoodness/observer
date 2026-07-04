import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { IngestController } from './ingest.controller'
import { IngestService } from './ingest.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'jira-tasks' }), ProjectsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
