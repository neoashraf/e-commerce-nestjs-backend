import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /admin/inventory/{variantId}/set` (FR-INV-015) — set on-hand to an absolute target.
 * `reason` is optional: a system reason is recorded when omitted (BR-INV-10). `source` tags the surface
 * that triggered the set (e.g. `product-editor`); it is folded into the audit reason (the ledger has no
 * dedicated source column).
 */
export class SetOnHandDto {
  @ApiProperty({ example: 12, minimum: 0, description: 'Absolute on-hand target (what-you-see-is-what-you-type)' })
  @IsInt()
  on_hand: number;

  @ApiPropertyOptional({ example: 'inline set · product editor', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;

  @ApiPropertyOptional({ example: 'product-editor', maxLength: 64, description: 'Provenance tag of the calling surface' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}
