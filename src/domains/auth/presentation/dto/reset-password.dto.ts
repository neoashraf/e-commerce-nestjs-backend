import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'prt_9f1c...', description: 'Single-use reset token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'newfooty2026',
    minLength: 8,
    description: 'New password (≥8 chars, at least one letter and one number)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
