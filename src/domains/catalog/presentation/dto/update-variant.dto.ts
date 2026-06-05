import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Per-variant edit (FR-CAT-022/023/024): sku_code override, price_override, image_id, is_enabled. */
export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'PRED-ELITE-BLK-42', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku_code?: string;

  @ApiPropertyOptional({ example: '12990.00', nullable: true, description: 'null clears the override' })
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: 'price_override must be a money value like "12990.00"' })
  price_override?: string | null;

  @ApiPropertyOptional({ description: 'Variant-specific image id', nullable: true })
  @IsOptional()
  @IsUUID()
  image_id?: string | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
