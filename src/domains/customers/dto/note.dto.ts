import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Add internal note (FR-CUST-030; contract: POST /admin/customers/{id}/notes). Body 1–2,000 chars (§11). */
export class CreateNoteDto {
  @ApiProperty({ example: 'Called about exchange; resolved.', minLength: 1, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
