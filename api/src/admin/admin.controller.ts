import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import type { ProjectsService } from '../projects/projects.service'
import { AdminGuard } from './admin.guard'

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

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly projects: ProjectsService) {}

  @Post('projects')
  async createProject(@Body() body: CreateProjectDto) {
    const project = await this.projects.create(body)
    return {
      id: project.id,
      name: project.name,
      publicKey: project.public_key,
    }
  }
}
