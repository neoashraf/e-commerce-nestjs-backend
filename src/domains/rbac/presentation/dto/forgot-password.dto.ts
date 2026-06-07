import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ops@store.com', maxLength: 160 })
  @IsEmail()
  @MaxLength(160)
  email: string;
}
