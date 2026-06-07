import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Query for `GET /geo/districts` — the division to list districts within (AC2). */
export class ListDistrictsQueryDto {
  @ApiProperty({ example: 'Dhaka', maxLength: 40, description: 'Division name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  division: string;
}
