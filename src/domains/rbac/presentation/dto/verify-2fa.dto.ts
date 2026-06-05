import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class Verify2faDto {
  @ApiProperty({ example: 'otp_5f3c…', description: 'Challenge id from the login response' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  challenge_id: string;

  @ApiProperty({ example: '204815', maxLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  code: string;
}
