import { Module } from '@nestjs/common'
import { ProjectAuthGuard } from './project-auth.guard'
import { ProjectsService } from './projects.service'

@Module({
  providers: [ProjectsService, ProjectAuthGuard],
  exports: [ProjectsService, ProjectAuthGuard],
})
export class ProjectsModule {}
