import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Query for the tokenized unsubscribe page (FR-NOTIF-054, §12.13). */
export class UnsubscribeQueryDto {
  @ApiProperty({ description: 'Signed unsubscribe token embedded in the promotional email link' })
  @IsString()
  token: string;
}
