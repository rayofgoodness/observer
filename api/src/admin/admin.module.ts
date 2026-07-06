import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MaintenanceModule } from '../maintenance/maintenance.module'
import { ProjectsModule } from '../projects/projects.module'
import { AdminController } from './admin.controller'
import { AdminUiController } from './admin-ui.controller'
import { AdminUiMiddleware } from './admin-ui.middleware'

@Module({
  imports: [ProjectsModule, MaintenanceModule, AuthModule],
  controllers: [AdminController, AdminUiController],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Only the HTML console page; the /admin/* API keeps AdminGuard.
    consumer
      .apply(AdminUiMiddleware)
      .forRoutes({ path: 'admin', method: RequestMethod.GET })
  }
}
