import 'dotenv/config'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import * as express from 'express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({
    origin: true,
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'X-Public-Key', 'X-Admin-Token'],
  })
  // Protobuf ingest arrives as raw bytes — capture the body as a Buffer for
  // these content types. JSON requests are untouched (default json parser).
  app.use(
    express.raw({
      type: ['application/x-protobuf', 'application/octet-stream'],
      limit: '1mb',
    }),
  )
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.listen(process.env.PORT ?? 3040)
}

bootstrap()
