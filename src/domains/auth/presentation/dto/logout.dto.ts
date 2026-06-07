import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token of the session to revoke' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
