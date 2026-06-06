import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update a template's subject/body; bumps `version` (FR-NOTIF-012). Event/channel/locale are immutable. */
export class UpdateTemplateDto {
  @ApiPropertyOptional({ example: null, description: 'New email subject (null clears it)', maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string | null;

  @ApiProperty({
    example: 'প্রিয় {{name}}, আপনার অর্ডার {{order_no}} পাঠানো হয়েছে। ট্র্যাকিং: {{tracking_no}}',
    description: 'New body with {{placeholders}} from the event type allowed set',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}
