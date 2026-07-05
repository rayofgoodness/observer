import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ProjectAuthGuard } from '../projects/project-auth.guard'
import type { Project } from '../projects/projects.service'
import { IngestDto } from './dto/ingest.dto'
import { decodeBatch } from './ingest.codec'
import { IngestService } from './ingest.service'

@Controller('v1')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('ingest')
  @UseGuards(ProjectAuthGuard)
  async ingestErrors(@Req() req: { project: Project; body: unknown }) {
    // Protobuf clients send raw bytes (express.raw → Buffer); JSON clients send
    // a parsed object. Decode the former into the same shape, then validate both
    // against IngestDto by hand (the global pipe only runs on typed params).
    const raw = Buffer.isBuffer(req.body) ? decodeBatch(req.body) : req.body

    const dto = plainToInstance(IngestDto, raw)
    const errors = await validate(dto, { whitelist: true })
    if (errors.length) {
      throw new BadRequestException('Invalid ingest payload')
    }

    return this.ingest.process(req.project, dto)
  }
}
