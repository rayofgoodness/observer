import { Global, Module } from '@nestjs/common'
import IORedis from 'ioredis'
import knex from 'knex'

export const KNEX = 'KNEX'
export const REDIS = 'REDIS'

@Global()
@Module({
  providers: [
    {
      provide: KNEX,
      useFactory: () =>
        knex({
          client: 'pg',
          connection: process.env.DATABASE_URL,
          pool: { min: 2, max: 10 },
        }),
    },
    {
      provide: REDIS,
      useFactory: () =>
        new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [KNEX, REDIS],
})
export class DatabaseModule {}
