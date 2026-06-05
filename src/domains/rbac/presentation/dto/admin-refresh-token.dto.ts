import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminRefreshTokenDto {
  @ApiProperty({ example: 'rt_9a8b…', description: 'The current refresh token' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
