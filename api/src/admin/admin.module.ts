import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MaintenanceModule } from '../maintenance/maintenance.module'
import { ProjectsModule } from '../projects/projects.module'
import { AdminController } from './admin.controller'

// AuthModule is imported so AdminGuard can resolve AuthService and authorize
// admin-role sessions (in addition to the X-Admin-Token). The admin console
// itself is now part of the SPA served at '/', not a separate HTML route.
@Module({
  imports: [ProjectsModule, MaintenanceModule, AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}
