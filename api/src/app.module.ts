import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { IngestModule } from './ingest/ingest.module'
import { JiraModule } from './jira/jira.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { ProjectsModule } from './projects/projects.module'

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    DatabaseModule,
    ProjectsModule,
    IngestModule,
    JiraModule,
    AdminModule,
    AuthModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
