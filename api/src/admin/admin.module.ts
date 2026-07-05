import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { AdminUiController } from './admin-ui.controller'
import { AdminController } from './admin.controller'

@Module({
  imports: [ProjectsModule],
  controllers: [AdminController, AdminUiController],
})
export class AdminModule {}
