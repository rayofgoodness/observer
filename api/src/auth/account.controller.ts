import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'
import { ProjectsService } from '../projects/projects.service'
import { type AuthedRequest, AuthGuard } from './auth.guard'

class CreateProjectDto {
  @IsString()
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[]
}

class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[]
}

// Self-service project + error management for the signed-in user. Every route
// is scoped to projects the user owns — never trusts the public key alone.
@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  async list(@Req() req: AuthedRequest) {
    const rows = await this.projects.listByUser(req.user.id)
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      publicKey: p.public_key,
      isActive: p.is_active,
      rateLimitPerMinute: p.rate_limit_per_minute,
      allowedOrigins: p.allowed_origins,
    }))
  }

  @Post('projects')
  async create(@Req() req: AuthedRequest, @Body() body: CreateProjectDto) {
    const project = await this.projects.create({
      name: body.name,
      userId: req.user.id,
      allowedOrigins: body.allowedOrigins,
    })
    return {
      id: project.id,
      name: project.name,
      publicKey: project.public_key,
    }
  }

  @Patch('projects/:publicKey')
  async update(
    @Req() req: AuthedRequest,
    @Param('publicKey') publicKey: string,
    @Body() body: UpdateProjectDto,
  ) {
    await this.own(publicKey, req.user.id)
    const project = await this.projects.update(publicKey, body)
    if (!project) throw new NotFoundException('Project not found')
    return {
      id: project.id,
      name: project.name,
      publicKey: project.public_key,
      isActive: project.is_active,
      allowedOrigins: project.allowed_origins,
    }
  }

  @Get('projects/:publicKey/errors')
  async errors(
    @Req() req: AuthedRequest,
    @Param('publicKey') publicKey: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    await this.own(publicKey, req.user.id)
    return this.projects.listErrorsByPublicKey(publicKey, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status: status || undefined,
    })
  }

  @Get('errors/:id')
  async errorDetail(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!(await this.projects.errorBelongsToUser(id, req.user.id))) {
      throw new NotFoundException('Error not found')
    }
    const detail = await this.projects.getErrorDetail(id)
    if (!detail) throw new NotFoundException('Error not found')
    return detail
  }

  /** Assert the user owns the project or throw — used before any mutation. */
  private async own(publicKey: string, userId: number): Promise<void> {
    const project = await this.projects.findOwned(publicKey, userId)
    if (!project) throw new ForbiddenException('Not your project')
  }
}
