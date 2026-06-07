import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

import { ProductVideoSource } from '../../domain/enums/product-type.enum';

/**
 * Add a product video (FR-CAT-034). For `source = url` the external `url` is required; for
 * `source = upload` the file arrives via multipart (`FileInterceptor`) and `url` is derived.
 */
export class AddVideoDto {
  @ApiProperty({ enum: ProductVideoSource, example: ProductVideoSource.URL })
  @IsEnum(ProductVideoSource)
  source: ProductVideoSource;

  @ApiPropertyOptional({ example: 'https://youtu.be/…', maxLength: 500 })
  @ValidateIf((o: AddVideoDto) => o.source === ProductVideoSource.URL)
  @IsString()
  @IsUrl()
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({ description: 'Order after images' })
  @IsOptional()
  @IsInt()
  display_order?: number;
}
