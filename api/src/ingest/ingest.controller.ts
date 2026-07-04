import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { ProjectAuthGuard } from '../projects/project-auth.guard'
import type { Project } from '../projects/projects.service'
import { IngestDto } from './dto/ingest.dto'
import { IngestService } from './ingest.service'

@Controller('v1')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('ingest')
  @UseGuards(ProjectAuthGuard)
  async ingestErrors(
    @Body() body: IngestDto,
    @Req() req: { project: Project },
  ) {
    return this.ingest.process(req.project, body)
  }
}
