import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { AdminController } from './admin.controller'

@Module({
  imports: [ProjectsModule],
  controllers: [AdminController],
})
export class AdminModule {}
