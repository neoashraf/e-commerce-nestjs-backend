import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminLogoutDto {
  @ApiProperty({ example: 'rt_9a8b…', description: 'The refresh token of the session to revoke' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
