import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

import { MAX_MEMBERSHIP_IDS } from '../../application/wishlist.constants';

/** Batch membership lookup for card-grid/PDP heart rendering (FR-WISH-040). */
export class MembershipDto {
  @ApiProperty({
    type: [String],
    example: ['c7a1e2f0-0000-4000-8000-000000000001', 'c9a1e2f0-0000-4000-8000-000000000003'],
    description: `Product ids to check membership for (max ${MAX_MEMBERSHIP_IDS}).`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MEMBERSHIP_IDS)
  @IsUUID('all', { each: true })
  product_ids: string[];
}
