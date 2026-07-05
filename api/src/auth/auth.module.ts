import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { AccountController } from './account.controller'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { DashboardUiController } from './dashboard-ui.controller'

@Module({
  imports: [ProjectsModule],
  controllers: [AuthController, AccountController, DashboardUiController],
  providers: [AuthService],
})
export class AuthModule {}
