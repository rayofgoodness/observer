import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MaintenanceProcessor } from './maintenance.processor'
import { MaintenanceService } from './maintenance.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'maintenance' })],
  providers: [MaintenanceService, MaintenanceProcessor],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
