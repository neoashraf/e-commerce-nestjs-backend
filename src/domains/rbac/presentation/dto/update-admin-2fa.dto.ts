import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';

export class UpdateAdmin2faDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ enum: TwofaChannel, example: TwofaChannel.SMS, description: 'Required when enabling' })
  @IsOptional()
  @IsEnum(TwofaChannel)
  channel?: TwofaChannel;

  @ApiProperty({ example: 'S3cret-Pass', description: 'Re-authentication (required to enable or disable)' })
  @IsString()
  @IsNotEmpty()
  current_password: string;
}
