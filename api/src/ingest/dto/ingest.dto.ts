import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export const ERROR_LEVELS = [
  'fatal',
  'error',
  'warning',
  'info',
  'debug',
] as const

export class BreadcrumbDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string

  @IsOptional()
  @IsISO8601()
  timestamp?: string

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>
}

export class IncomingErrorDto {
  @IsString()
  @MaxLength(1000)
  message!: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  source?: string

  @IsOptional()
  @IsIn(ERROR_LEVELS)
  level?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  route?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string

  @IsOptional()
  @IsObject()
  device?: Record<string, unknown>

  @IsOptional()
  @IsISO8601()
  occurredAt?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BreadcrumbDto)
  breadcrumbs?: BreadcrumbDto[]
}

export class IngestMetaDto {
  @IsOptional()
  @IsObject()
  device?: Record<string, unknown>

  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string
}

export class IngestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IngestMetaDto)
  meta?: IngestMetaDto

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => IncomingErrorDto)
  errors!: IncomingErrorDto[]
}
