import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Query for `GET /geo/areas` — the district to list upazilas/thanas within (AC2). */
export class ListAreasQueryDto {
  @ApiProperty({ example: 'Dhaka', maxLength: 40, description: 'District name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  district: string;
}
