import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'footy2026' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({ example: 'newfooty2026', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
