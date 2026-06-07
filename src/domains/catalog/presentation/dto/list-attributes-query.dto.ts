import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { AttributeType } from '../../domain/enums/attribute-type.enum';

/** Coerce `?flag=true|false` query strings to booleans. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

/** Query filters for `GET /admin/attributes` (FR-CAT-050/057/058). */
export class ListAttributesQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: AttributeType })
  @IsOptional()
  @IsEnum(AttributeType)
  type?: AttributeType;

  @ApiPropertyOptional({ description: 'Filter by filterable (layered-nav) flag' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  filterable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_unique?: boolean;

  @ApiPropertyOptional({ description: 'Filter by origin: user-defined vs seeded system attribute' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_user_defined?: boolean;

  @ApiPropertyOptional({ description: 'Search by code / admin label' })
  @IsOptional()
  @IsString()
  q?: string;
}
