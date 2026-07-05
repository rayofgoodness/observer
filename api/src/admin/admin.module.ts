import { Module } from '@nestjs/common'
import { MaintenanceModule } from '../maintenance/maintenance.module'
import { ProjectsModule } from '../projects/projects.module'
import { AdminUiController } from './admin-ui.controller'
import { AdminController } from './admin.controller'

@Module({
  imports: [ProjectsModule, MaintenanceModule],
  controllers: [AdminController, AdminUiController],
})
export class AdminModule {}
