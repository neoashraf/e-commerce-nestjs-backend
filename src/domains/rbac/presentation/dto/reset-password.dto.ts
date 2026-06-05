import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { ADMIN_PASSWORD_REGEX } from '../../domain/password-policy';

export class ResetPasswordDto {
  @ApiProperty({ example: 'prt_2b7e…', description: 'The reset token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'N3w-Passw0rd',
    minLength: 10,
    maxLength: 200,
    description: '≥10 chars with at least one upper, one lower, and one number',
  })
  @IsString()
  @MaxLength(200)
  @Matches(ADMIN_PASSWORD_REGEX, {
    message: 'Password must be at least 10 characters with upper, lower, and number.',
  })
  new_password: string;
}
