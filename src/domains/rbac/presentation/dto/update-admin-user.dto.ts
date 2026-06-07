import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'New Ops Lead', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ example: '+8801812345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'phone must be a valid Bangladesh mobile number (+8801XXXXXXXXX)' })
  phone?: string;

  @ApiPropertyOptional({ example: 'role_catalog_mgr' })
  @IsOptional()
  @IsString()
  role_id?: string;
}
