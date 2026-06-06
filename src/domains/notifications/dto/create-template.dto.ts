import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { NotificationChannel } from '../notification.enums';

/** Create a template for an (event_type × channel × locale) (FR-NOTIF-010/011/013). */
export class CreateTemplateDto {
  @ApiProperty({ example: 'order.shipped', description: 'Catalog event type (Appendix A)', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  event_type: string;

  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.SMS })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({ example: 'bn', enum: ['en', 'bn'] })
  @IsEnum({ en: 'en', bn: 'bn' })
  locale: string;

  @ApiPropertyOptional({ example: null, description: 'Email subject template (null for SMS)', maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string | null;

  @ApiProperty({
    example: 'প্রিয় {{name}}, আপনার অর্ডার {{order_no}} {{courier}} এর মাধ্যমে পাঠানো হয়েছে। ট্র্যাকিং: {{tracking_no}}',
    description: 'Body with {{placeholders}} from the event type allowed set',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}
