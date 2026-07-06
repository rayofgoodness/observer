import { join } from 'node:path'
import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ServeStaticModule } from '@nestjs/serve-static'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { IngestModule } from './ingest/ingest.module'
import { JiraModule } from './jira/jira.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { ProjectsModule } from './projects/projects.module'
import { TelegramModule } from './telegram/telegram.module'

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    // Serve the built Vue console assets (admin-ui/dist) under /ui. The HTML
    // entry is returned at the real /admin and /dashboard URLs by their
    // controllers (spaIndexHtml), so those keep their guards. Path is resolved
    // from the repo root (the API is started from api/, so cwd is api/).
    // Assets-only: index:false + fallthrough:false so /ui serves real files and
    // 404s on unknown paths — no index.html fallback that would let /ui/admin
    // bypass the /admin role gate.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'admin-ui', 'dist'),
      serveRoot: '/ui',
      serveStaticOptions: { index: false, fallthrough: false },
    }),
    DatabaseModule,
    ProjectsModule,
    IngestModule,
    JiraModule,
    AdminModule,
    AuthModule,
    MaintenanceModule,
    TelegramModule,
  ],
})
export class AppModule {}
