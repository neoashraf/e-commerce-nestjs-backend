import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /me/email/change/request (FR-AUTH-041). */
export class EmailChangeRequestDto {
  @ApiProperty({ example: 'new@example.com', maxLength: 160 })
  @IsEmail()
  @MaxLength(160)
  new_email: string;
}

/** Body for POST /me/email/change/confirm (FR-AUTH-044). */
export class EmailChangeConfirmDto {
  @ApiProperty({ example: 'ecr_9f2c…', description: 'Request id from change/request' })
  @IsString()
  @IsNotEmpty()
  request_id: string;

  @ApiProperty({ example: '204815', description: 'Code received at the new address' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class EmailChangeRequestResponseDto {
  @ApiProperty({ example: 'ecr_9f2c…' })
  request_id: string;

  @ApiProperty({ example: 'n**@example.com', description: 'Masked pending address' })
  sent_to: string;

  @ApiProperty({ example: 900, description: 'Pending-change lifetime in seconds' })
  expires_in: number;
}

export class EmailChangeConfirmResponseDto {
  @ApiProperty({ example: 'new@example.com' })
  email: string;

  @ApiProperty({ example: true, description: 'Always true — attached already verified' })
  email_verified: boolean;
}
