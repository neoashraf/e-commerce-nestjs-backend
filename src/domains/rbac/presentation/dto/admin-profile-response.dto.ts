import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';

export class UpdateAdminMeResponseDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  full_name: string;

  @ApiPropertyOptional({ example: '+8801712345678', nullable: true })
  phone: string | null;
}

export class AdminMessageResponseDto {
  @ApiProperty({ example: 'Password changed.' })
  message: string;
}

export class Update2faResponseDto {
  @ApiProperty({ example: true })
  twofa_enabled: boolean;

  @ApiPropertyOptional({ enum: TwofaChannel, nullable: true })
  channel: TwofaChannel | null;
}
