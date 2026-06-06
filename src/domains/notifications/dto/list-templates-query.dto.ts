import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { NotificationChannel } from '../notification.enums';

/** Filters for the template list (FR-NOTIF-010). */
export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ example: 'order.shipped', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  event_type?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ example: 'bn', enum: ['en', 'bn'] })
  @IsOptional()
  @IsEnum({ en: 'en', bn: 'bn' })
  locale?: string;

  @ApiPropertyOptional({ example: 'true', description: 'Filter by active state' })
  @IsOptional()
  @IsBooleanString()
  @Transform(({ value }) => value)
  active?: string;
}
