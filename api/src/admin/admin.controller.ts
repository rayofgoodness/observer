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
  ArrayMaxSize,
  ArrayNotEmpty,
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
import { ERROR_STATUSES, parseStatusFilter } from '../common/error-status.util'
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
  @IsIn(ERROR_STATUSES)
  status!: string
}

class DeleteErrorsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids!: number[]
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

  // --- Deleting logs (occurrences cascade with the error group) ---

  /** Bulk delete. POST, not DELETE, because a body on DELETE is unreliable. */
  @Post('errors/bulk-delete')
  async deleteErrors(@Body() body: DeleteErrorsDto) {
    const deleted = await this.projects.deleteErrors(body.ids)
    return { deleted }
  }

  @Delete('errors/:id')
  async deleteError(@Param('id', ParseIntPipe) id: number) {
    const deleted = await this.projects.deleteErrors([id])
    if (!deleted) throw new NotFoundException('Error not found')
    return { deleted }
  }

  /** Wipe a project's errors, optionally only those in one status. */
  @Delete('projects/:publicKey/errors')
  async deleteProjectErrors(
    @Param('publicKey') publicKey: string,
    @Query('status') status?: string,
  ) {
    const deleted = await this.projects.deleteErrorsByPublicKey(
      publicKey,
      parseStatusFilter(status),
    )
    if (deleted === null) throw new NotFoundException('Project not found')
    return { deleted }
  }
}
