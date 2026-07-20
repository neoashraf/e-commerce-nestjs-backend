import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

import { MfaChannel } from '../../domain/enums/mfa-channel.enum';

export class EnableMfaDto {
  @ApiPropertyOptional({
    enum: MfaChannel,
    description: 'Preferred channel; defaults to the single eligible channel (email by default).',
  })
  @IsOptional()
  @IsEnum(MfaChannel)
  preferred_channel?: MfaChannel;
}

export class ConfirmEnableMfaDto {
  @ApiProperty({ example: 'mfa_c2d3…' })
  @IsString()
  @IsNotEmpty()
  challenge_id: string;

  @ApiProperty({ example: '204815' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class DisableMfaDto {
  @ApiProperty({ example: 'footy2026' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiPropertyOptional({
    example: '482913',
    description: 'Fresh second-factor code — required only when the session is not 2FA-verified.',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;
}

export class SetPreferredChannelDto {
  @ApiProperty({ enum: MfaChannel, example: MfaChannel.SMS })
  @IsEnum(MfaChannel)
  preferred_channel: MfaChannel;
}
