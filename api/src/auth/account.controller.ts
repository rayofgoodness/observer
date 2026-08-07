import {
  Body,
  Controller,
  Delete,
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
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { parseStatusFilter } from '../common/error-status.util'
import { ProjectsService } from '../projects/projects.service'
import { TelegramService } from '../telegram/telegram.service'
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

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telegramChatId?: string

  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean
}

class DeleteErrorsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids!: number[]
}

// Self-service project + error management for the signed-in user. Every route
// is scoped to projects the user owns — never trusts the public key alone.
@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly telegram: TelegramService,
  ) {}

  @Get('projects')
  async list(@Req() req: AuthedRequest) {
    const rows = await this.projects.listByUser(req.user.id)
    const telegramConfigured = this.telegram.isConfigured()
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      publicKey: p.public_key,
      isActive: p.is_active,
      rateLimitPerMinute: p.rate_limit_per_minute,
      allowedOrigins: p.allowed_origins,
      telegramChatId: p.telegram_chat_id,
      telegramEnabled: p.telegram_enabled,
      // Whether the platform bot itself is set up (env). If false, the client's
      // chat id can't receive anything yet — surfaced so the UI can explain.
      telegramConfigured,
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
      telegramChatId: project.telegram_chat_id,
      telegramEnabled: project.telegram_enabled,
    }
  }

  /** Send a test message to the project's Telegram chat to verify wiring. */
  @Post('projects/:publicKey/telegram/test')
  async telegramTest(
    @Req() req: AuthedRequest,
    @Param('publicKey') publicKey: string,
  ) {
    const project = await this.projects.findOwned(publicKey, req.user.id)
    if (!project) throw new ForbiddenException('Not your project')
    if (!this.telegram.isConfigured()) {
      return { ok: false, reason: 'Telegram bot not configured on the server' }
    }
    if (!project.telegram_chat_id) {
      return { ok: false, reason: 'No chat id set' }
    }
    const sent = await this.telegram.sendMessage(
      project.telegram_chat_id,
      this.telegram.formatNewError({
        projectName: project.name,
        level: 'info',
        source: 'test',
        message: 'Test notification — Telegram is wired up correctly ✅',
      }),
    )
    return {
      ok: sent,
      reason: sent ? undefined : 'Telegram API rejected the message',
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

  // --- Deleting logs (occurrences cascade with the error group) ---

  /** Bulk delete. POST, not DELETE, because a body on DELETE is unreliable. */
  @Post('errors/bulk-delete')
  async deleteErrors(@Req() req: AuthedRequest, @Body() body: DeleteErrorsDto) {
    // Filter to the ids this user actually owns, then delete only those — an
    // id from someone else's project is silently skipped, never touched.
    const owned = await this.projects.filterErrorsOwnedBy(body.ids, req.user.id)
    const deleted = await this.projects.deleteErrors(owned)
    return { deleted, skipped: body.ids.length - deleted }
  }

  @Delete('errors/:id')
  async deleteError(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!(await this.projects.errorBelongsToUser(id, req.user.id))) {
      throw new NotFoundException('Error not found')
    }
    const deleted = await this.projects.deleteErrors([id])
    if (!deleted) throw new NotFoundException('Error not found')
    return { deleted }
  }

  /** Wipe the project's errors, optionally only those in one status. */
  @Delete('projects/:publicKey/errors')
  async deleteProjectErrors(
    @Req() req: AuthedRequest,
    @Param('publicKey') publicKey: string,
    @Query('status') status?: string,
  ) {
    await this.own(publicKey, req.user.id)
    const deleted = await this.projects.deleteErrorsByPublicKey(
      publicKey,
      parseStatusFilter(status),
    )
    if (deleted === null) throw new NotFoundException('Project not found')
    return { deleted }
  }

  /** Assert the user owns the project or throw — used before any mutation. */
  private async own(publicKey: string, userId: number): Promise<void> {
    const project = await this.projects.findOwned(publicKey, userId)
    if (!project) throw new ForbiddenException('Not your project')
  }
}
