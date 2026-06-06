import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { MAX_MERGE_ITEMS } from '../../application/wishlist.constants';

/** One entry of a guest's local wishlist (FR-WISH-031). */
export class MergeItemDto {
  @ApiProperty({ example: 'c7a1e2f0-0000-4000-8000-000000000001' })
  @IsUUID()
  product_id: string;

  @ApiPropertyOptional({ example: 'v1a1e2f0-0000-4000-8000-000000000002' })
  @IsOptional()
  @IsUUID()
  preferred_variant_id?: string;
}

/** Merge a guest's local wishlist into the account on login/registration (FR-WISH-031–033). */
export class MergeWishlistDto {
  @ApiProperty({ type: [MergeItemDto], description: `Guest wishlist entries (max ${MAX_MERGE_ITEMS}).` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MERGE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MergeItemDto)
  items: MergeItemDto[];
}
