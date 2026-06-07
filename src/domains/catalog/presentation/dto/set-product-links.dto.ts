import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Full-replace of a product's typed links (FR-CAT-019). Any omitted list defaults to empty
 * (i.e. clears that link type). Self-references are excluded and unknown targets rejected in
 * the service.
 */
export class SetProductLinksDto {
  @ApiPropertyOptional({ type: [String], description: 'Related product UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  related?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Up-sell product UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  up_sell?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Cross-sell product UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  cross_sell?: string[];
}
