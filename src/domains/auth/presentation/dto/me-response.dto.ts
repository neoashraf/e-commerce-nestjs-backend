import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Gender } from '../../domain/enums/gender.enum';

export class MeResponseDto {
  @ApiProperty({ example: 'c_77...' })
  id: string;

  @ApiProperty({ example: 'Sabbir Ahmed' })
  full_name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiProperty({ example: true })
  phone_verified: boolean;

  @ApiPropertyOptional({ example: 'sabbir@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: false })
  email_verified: boolean;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  gender: Gender | null;

  @ApiPropertyOptional({ example: '1995-03-12', nullable: true })
  date_of_birth: string | null;

  @ApiProperty({ example: false })
  promo_sms_opt_in: boolean;

  @ApiProperty({ example: true })
  promo_email_opt_in: boolean;
}

export class UpdateProfileResponseDto {
  @ApiProperty({ example: 'c_77...' })
  id: string;

  @ApiProperty({ example: 'Sabbir A.' })
  full_name: string;
}

export class ChangePhoneRequestResponseDto {
  @ApiProperty({ example: 'otp_9f1c...' })
  challenge_id: string;

  @ApiProperty({ example: 300 })
  expires_in: number;
}

export class ChangePhoneConfirmResponseDto {
  @ApiProperty({ example: '+8801812345678' })
  phone: string;

  @ApiProperty({ example: true })
  phone_verified: boolean;
}
