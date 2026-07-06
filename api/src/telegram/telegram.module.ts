import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TelegramProcessor } from './telegram.processor'
import { TelegramScheduler } from './telegram.scheduler'
import { TelegramService } from './telegram.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  providers: [TelegramService, TelegramProcessor, TelegramScheduler],
  exports: [TelegramService],
})
export class TelegramModule {}
