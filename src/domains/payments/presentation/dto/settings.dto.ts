import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

import { GatewayEnvironment } from '../../domain/payment-enums';

/** One method's settings patch (FR-PAY-060). `credentials_ref` is a pointer, never a raw secret. */
export class GatewayMethodSettingsDto {
  @ApiPropertyOptional({ enum: GatewayEnvironment, example: GatewayEnvironment.LIVE })
  @IsOptional()
  @IsEnum(GatewayEnvironment)
  environment?: GatewayEnvironment;

  @ApiPropertyOptional({ example: 'secret://pay/bkash', description: 'Secret reference, not the secret.' })
  @IsOptional()
  @IsString()
  credentials_ref?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

/** PUT /admin/payment-settings body (FR-PAY-060/061). */
export class UpdateGatewaySettingsDto {
  @ApiPropertyOptional({ type: GatewayMethodSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GatewayMethodSettingsDto)
  bkash?: GatewayMethodSettingsDto;

  @ApiPropertyOptional({ type: GatewayMethodSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GatewayMethodSettingsDto)
  sslcommerz?: GatewayMethodSettingsDto;

  @ApiPropertyOptional({ type: GatewayMethodSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GatewayMethodSettingsDto)
  cod?: GatewayMethodSettingsDto;
}

class GatewaySettingsViewDto {
  @ApiPropertyOptional({ enum: GatewayEnvironment, nullable: true })
  environment: GatewayEnvironment | null;

  @ApiPropertyOptional({ example: 'secret://pay/bkash', nullable: true })
  credentials_ref: string | null;

  @ApiProperty({ example: true })
  is_enabled: boolean;
}

export class GatewaySettingsResponseDto {
  @ApiProperty({ type: GatewaySettingsViewDto })
  bkash: GatewaySettingsViewDto;

  @ApiProperty({ type: GatewaySettingsViewDto })
  sslcommerz: GatewaySettingsViewDto;

  @ApiProperty({ type: GatewaySettingsViewDto })
  cod: GatewaySettingsViewDto;
}
