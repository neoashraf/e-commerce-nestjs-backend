import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Non-sensitive export fields (FR-CUST-040; never passwords/tokens — §11). */
export const EXPORTABLE_FIELDS = [
  'full_name',
  'phone',
  'email',
  'status',
  'order_count',
  'total_spent',
  'last_order_at',
] as const;

/** Filters reused from the directory query (subset; FR-CUST-040/032). */
export class ExportFiltersDto {
  @ApiPropertyOptional({ example: 'wholesale' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '+880' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  last_order_from?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  last_order_to?: string;
}

/** Export request (FR-CUST-040; contract: POST /admin/customers/export → 202). */
export class CreateExportDto {
  @ApiPropertyOptional({ type: ExportFiltersDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExportFiltersDto)
  filters?: ExportFiltersDto;

  @ApiPropertyOptional({
    example: ['full_name', 'phone', 'email', 'order_count', 'total_spent', 'last_order_at'],
    description: 'Subset of exportable fields; defaults to all non-sensitive fields',
  })
  @IsOptional()
  @IsArray()
  @IsIn(EXPORTABLE_FIELDS as unknown as string[], { each: true })
  fields?: string[];

  @ApiPropertyOptional({ enum: ['csv'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv'])
  format?: string;
}
