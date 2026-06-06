import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

import { NotificationChannel, NotificationStatus } from '../notification.enums';

/**
 * Filters for the admin delivery-log list (FR-NOTIF-060) and the entity-scoped view
 * (FR-NOTIF-044). All filters are optional and AND-combined; `entity_type`/`entity_id`
 * scope the same list shape to a single business entity (an order, a lead, …).
 */
export class ListNotificationsDto {
  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ example: 'otp.login', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  event_type?: string;

  @ApiPropertyOptional({ example: '+8801712345678', description: 'Exact recipient address (phone/email)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipient?: string;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'Inclusive lower bound on created_at (ISO date/datetime)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-04', description: 'Inclusive upper bound on created_at (ISO date/datetime)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 'Order', maxLength: 40, description: 'Scope to a business entity (with entity_id) — FR-NOTIF-044' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entity_type?: string;

  @ApiPropertyOptional({ example: 'ord_88', maxLength: 64, description: 'Business entity id (with entity_type) — FR-NOTIF-044' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity_id?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
