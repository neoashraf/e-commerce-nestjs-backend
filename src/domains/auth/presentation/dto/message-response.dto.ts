import { ApiProperty } from '@nestjs/swagger';

/** Generic `{ data: { message } }` payload used by the password forgot/reset endpoints. */
export class MessageResponseDto {
  @ApiProperty({ example: 'If the email exists, a reset link has been sent.' })
  message: string;
}
