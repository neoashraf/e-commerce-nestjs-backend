import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SmsDlrDto {
  @ApiProperty({ example: 'SMS-uuid' }) @IsString() message_ref: string;
  @ApiProperty({ example: 'DELIVERED' }) @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() delivered_at?: string;
}

export class EmailEventDto {
  @ApiProperty({ example: 'EMAIL-uuid' }) @IsString() message_ref: string;
  @ApiProperty({ example: 'delivered' }) @IsString() event: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipient?: string;
}
