import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+8801712345678', description: 'Bangladesh mobile number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ enum: ['login', 'register', 'password_reset'], default: 'login' })
  @IsOptional()
  @IsIn(['login', 'register', 'password_reset'])
  purpose?: 'login' | 'register' | 'password_reset';
}
