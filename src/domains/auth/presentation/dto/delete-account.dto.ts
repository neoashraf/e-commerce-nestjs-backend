import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ example: true, description: 'Must be true to confirm deletion' })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}
