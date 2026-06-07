import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

import { AuditResult } from '../../domain/enums/audit-result.enum';

export class ListAuditQueryDto {
  @ApiPropertyOptional({ description: 'Actor admin id' })
  @IsOptional()
  @IsString()
  actor?: string;

  @ApiPropertyOptional({ example: 'rbac.role.update' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'Role' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional({ enum: AuditResult })
  @IsOptional()
  @IsEnum(AuditResult)
  result?: AuditResult;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'From date (inclusive)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-04', description: 'To date (inclusive)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: ['csv'], description: 'Export format (export endpoint only)' })
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
