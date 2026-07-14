import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

import { MfaChannel } from '../../domain/enums/mfa-channel.enum';

export class VerifyMfaDto {
  @ApiProperty({ example: 'pat_3af9…', description: 'Pre-auth token from the login response' })
  @IsString()
  @IsNotEmpty()
  pre_auth_token: string;

  @ApiProperty({ example: '482913', description: '6-digit second-factor code' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResendMfaDto {
  @ApiProperty({ example: 'pat_3af9…' })
  @IsString()
  @IsNotEmpty()
  pre_auth_token: string;
}

export class SwitchMfaChannelDto {
  @ApiProperty({ example: 'pat_3af9…' })
  @IsString()
  @IsNotEmpty()
  pre_auth_token: string;

  @ApiProperty({ enum: MfaChannel, example: MfaChannel.SMS })
  @IsEnum(MfaChannel)
  channel: MfaChannel;

  @ApiPropertyOptional({ example: true, description: 'Also save this as the preferred channel' })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
