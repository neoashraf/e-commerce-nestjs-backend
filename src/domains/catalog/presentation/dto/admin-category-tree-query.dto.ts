import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Coerce `?flag=true|false` query strings to booleans. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

/** Query options for `GET /admin/categories` (the admin tree). */
export class AdminCategoryTreeQueryDto {
  @ApiPropertyOptional({
    description: 'Include soft-deleted categories in the tree',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_deleted?: boolean;
}
