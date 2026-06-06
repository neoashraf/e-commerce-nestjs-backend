import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /me/leads/{reference}/reply` request (FR-LEAD-021). Customer follow-up onto an existing thread. */
export class CustomerReplyDto {
  @ApiProperty({ example: 'Address confirmed, please proceed.', minLength: 1, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
