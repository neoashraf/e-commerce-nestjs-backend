import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'ops@store.com', maxLength: 160 })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'S3cret-Pass', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Keep this device signed in longer (90d refresh vs 30d).',
  })
  @IsOptional()
  @IsBoolean()
  remember_device?: boolean;
}
