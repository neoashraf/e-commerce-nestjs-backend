import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sabbir@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'footy2026' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
