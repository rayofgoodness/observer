import { Module } from '@nestjs/common'
import { SpaUiController } from '../common/spa-ui.controller'
import { ProjectsModule } from '../projects/projects.module'
import { TelegramModule } from '../telegram/telegram.module'
import { AccountController } from './account.controller'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [ProjectsModule, TelegramModule],
  controllers: [AuthController, AccountController, SpaUiController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
