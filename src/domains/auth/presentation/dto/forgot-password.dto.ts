import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'sabbir@example.com', description: 'Account email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
