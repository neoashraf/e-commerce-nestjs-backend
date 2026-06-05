import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangeAdminPasswordDto {
  @ApiProperty({ example: 'S3cret-Pass' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({ example: 'N3w-Secret-Pass', minLength: 10, description: '≥10 chars, upper + lower + number' })
  @IsString()
  @MinLength(10)
  new_password: string;
}
