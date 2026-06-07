import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class RecipientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customer_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() admin_user_id?: string;
  @ApiPropertyOptional({ example: '+8801712345678' }) @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ example: 'a@b.com' }) @IsOptional() @IsString() email?: string;
}

class RelatedEntityDto {
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() id: string;
}

export class DispatchDto {
  @ApiProperty({ example: 'otp.login' })
  @IsString()
  event_type: string;

  @ApiPropertyOptional({ example: 'bn', default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiProperty({ type: RecipientDto })
  @ValidateNested()
  @Type(() => RecipientDto)
  recipient: RecipientDto;

  @ApiPropertyOptional({ enum: ['sms', 'email'], isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(['sms', 'email'], { each: true })
  channels?: Array<'sms' | 'email'>;

  @ApiPropertyOptional({ type: RelatedEntityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RelatedEntityDto)
  related_entity?: RelatedEntityDto;

  @ApiProperty({ example: { code: '482913', ttl_minutes: 5 } })
  @IsObject()
  variables: Record<string, string | number>;

  @ApiPropertyOptional({ example: 'otp.login:+8801712345678' })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
