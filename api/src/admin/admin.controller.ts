import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { MaintenanceService } from '../maintenance/maintenance.service'
import { ProjectsService } from '../projects/projects.service'
import { AdminGuard } from './admin.guard'

class CreateScheduleDto {
  // Standard 5-field cron (minute hour day month weekday).
  @IsString()
  @MaxLength(100)
  cron!: string

  @IsInt()
  @Min(1)
  @Max(3650)
  olderThanDays!: number

  @IsOptional()
  @IsInt()
  projectId?: number
}

class RunPurgeDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  olderThanDays!: number

  @IsOptional()
  @IsInt()
  projectId?: number
}

class CreateProjectDto {
  @IsString()
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[]

  @IsOptional()
  @IsBoolean()
  aiJiraEnabled?: boolean

  @IsOptional()
  @IsString()
  jiraBaseUrl?: string

  @IsOptional()
  @IsString()
  jiraEmail?: string

  @IsOptional()
  @IsString()
  jiraApiToken?: string

  @IsOptional()
  @IsString()
  jiraProjectKey?: string
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  rateLimitPerMinute?: number
}

class UpdateErrorDto {
  @IsIn(['new', 'resolved', 'ignored'])
  status!: string
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly maintenance: MaintenanceService,
  ) {}

  // --- Scheduled maintenance (error_occurrences retention) ---

  @Get('schedules')
  listSchedules() {
    return this.maintenance.listSchedules()
  }

  @Post('schedules')
  createSchedule(@Body() body: CreateScheduleDto) {
    return this.maintenance.createSchedule({
      cron: body.cron,
      olderThanDays: body.olderThanDays,
      projectId: body.projectId ?? null,
    })
  }

  @Delete('schedules')
  async deleteSchedule(@Query('key') key: string) {
    if (!key) throw new NotFoundException('Schedule key required')
    const removed = await this.maintenance.removeSchedule(key)
    if (!removed) throw new NotFoundException('Schedule not found')
    return { removed: true }
  }

  @Post('schedules/run')
  runPurge(@Body() body: RunPurgeDto) {
    return this.maintenance.runNow(body.olderThanDays, body.projectId ?? null)
  }

  @Get('projects')
  async listProjects() {
    const projects = await this.projects.list()
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      publicKey: p.public_key,
      isActive: p.is_active,
      rateLimitPerMinute: p.rate_limit_per_minute,
      allowedOrigins: p.allowed_origins,
      aiJiraEnabled: p.ai_jira_enabled,
    }))
  }

  @Post('projects')
  async createProject(@Body() body: CreateProjectDto) {
    const project = await this.projects.create(body)
    return {
      id: project.id,
      name: project.name,
      publicKey: project.public_key,
    }
  }

  @Patch('projects/:publicKey')
  async updateProject(
    @Param('publicKey') publicKey: string,
    @Body() body: UpdateProjectDto,
  ) {
    const project = await this.projects.update(publicKey, body)
    if (!project) throw new NotFoundException('Project not found')
    return {
      id: project.id,
      name: project.name,
      publicKey: project.public_key,
      isActive: project.is_active,
      rateLimitPerMinute: project.rate_limit_per_minute,
    }
  }

  @Post('projects/:publicKey/flush-cache')
  async flushCache(@Param('publicKey') publicKey: string) {
    await this.projects.invalidate(publicKey)
    return { flushed: true, publicKey }
  }

  @Get('projects/:publicKey/errors')
  async listErrors(
    @Param('publicKey') publicKey: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.projects.listErrorsByPublicKey(publicKey, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status: status || undefined,
    })
  }

  @Get('errors/:id')
  async errorDetail(@Param('id', ParseIntPipe) id: number) {
    const detail = await this.projects.getErrorDetail(id)
    if (!detail) throw new NotFoundException('Error not found')
    return detail
  }

  @Patch('errors/:id')
  async updateErrorStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateErrorDto,
  ) {
    const row = await this.projects.setErrorStatus(id, body.status)
    if (!row) throw new NotFoundException('Error not found')
    return row
  }
}
