import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** Internal batched availability request (FR-INV-003/004). */
export class BatchAvailabilityDto {
  @ApiProperty({ type: [String], example: ['v1', 'v2', 'v3'], description: 'Variant ids to look up' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  variant_ids: string[];
}
