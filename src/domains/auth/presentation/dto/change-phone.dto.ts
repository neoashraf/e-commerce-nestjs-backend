import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePhoneRequestDto {
  @ApiProperty({ example: '+8801812345678', description: 'New BD mobile number' })
  @IsString()
  @IsNotEmpty()
  new_phone: string;
}

export class ChangePhoneConfirmDto {
  @ApiProperty({ example: 'otp_9f1c...' })
  @IsString()
  @IsNotEmpty()
  challenge_id: string;

  @ApiProperty({ example: '112233' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
