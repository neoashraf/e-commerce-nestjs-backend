import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InviteAdminUserDto {
  @ApiProperty({ example: 'New Ops', maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ example: 'newops@store.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '+8801712345678' })
  @IsOptional()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'phone must be a valid Bangladesh mobile number (+8801XXXXXXXXX)' })
  phone?: string;

  @ApiProperty({ example: 'role_order_mgr' })
  @IsString()
  @IsNotEmpty()
  role_id: string;
}
