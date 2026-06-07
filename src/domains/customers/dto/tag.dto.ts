import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Create a tag in the catalog (FR-CUST-031; contract: POST /admin/customer-tags). */
export class CreateTagDto {
  @ApiProperty({ example: 'wholesale', maxLength: 40, description: 'Lowercase key [a-z0-9_-]' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[a-z0-9_-]+$/, { message: 'key must match [a-z0-9_-]' })
  key: string;

  @ApiProperty({ example: 'Wholesale', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @ApiPropertyOptional({ example: '#1A7F37', description: 'Optional hex color' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

/** Assign an existing tag to a customer (FR-CUST-031; contract: POST /admin/customers/{id}/tags). */
export class AssignTagDto {
  @ApiProperty({ example: 'tag_vip', description: 'Tag id to assign' })
  @IsString()
  @IsNotEmpty()
  tag_id: string;
}
