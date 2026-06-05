import { ApiProperty } from '@nestjs/swagger';

/** One generated variant in the generate-matrix response. */
export class GeneratedVariantDto {
  @ApiProperty({ example: 'v1-uuid' })
  id: string;

  @ApiProperty({ example: 'PRED-ELITE-BLK-42' })
  sku_code: string;

  @ApiProperty({
    example: { color: 'o-black', size: 'o-42' },
    description: 'Attribute-code → option-id coordinate',
  })
  options: Record<string, string>;
}

/** Generate-matrix response (`{ data }` envelope added by the interceptor). */
export class GenerateVariantsResponseDto {
  @ApiProperty({ example: 4, description: 'Number of variants created in this call' })
  variants_created: number;

  @ApiProperty({ type: [GeneratedVariantDto] })
  variants: GeneratedVariantDto[];
}

/** Update-variant response. */
export class UpdateVariantResponseDto {
  @ApiProperty({ example: 'v1-uuid' })
  id: string;
}
