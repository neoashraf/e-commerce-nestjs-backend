import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

enum LinkTypeDto {
  CATEGORY = 'category',
  PAGE = 'page',
  URL = 'url',
}

/** A child menu item (no further nesting — one level only). */
export class MenuChildDto {
  @ApiProperty({ example: 'Firm Ground', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @ApiProperty({ enum: LinkTypeDto, example: LinkTypeDto.CATEGORY })
  @IsEnum(LinkTypeDto)
  link_type: LinkTypeDto;

  @ApiProperty({ example: 'firm-ground', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  link_ref: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}

/** A top-level menu item (may carry one level of children). */
export class MenuItemDto {
  @ApiProperty({ example: 'Football Boots', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @ApiProperty({ enum: LinkTypeDto, example: LinkTypeDto.CATEGORY })
  @IsEnum(LinkTypeDto)
  link_type: LinkTypeDto;

  @ApiProperty({ example: 'football-boots', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  link_ref: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @ApiPropertyOptional({ type: [MenuChildDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuChildDto)
  children?: MenuChildDto[];
}

/** Replace the whole ordered menu tree (contract: PUT /admin/menus/{menu}). */
export class PutMenuDto {
  @ApiProperty({ type: [MenuItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items: MenuItemDto[];
}

/** PUT response (contract: { updated: true }). */
export class MenuUpdatedDto {
  @ApiProperty({ example: true }) updated: boolean;
}
