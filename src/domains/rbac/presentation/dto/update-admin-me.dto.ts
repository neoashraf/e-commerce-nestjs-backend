import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminMeDto {
  @ApiPropertyOptional({ example: 'Ops Lead', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ example: '+8801712345678', description: 'BD mobile in E.164' })
  @IsOptional()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'phone must be a valid Bangladesh mobile number (+8801XXXXXXXXX)' })
  phone?: string;
}
