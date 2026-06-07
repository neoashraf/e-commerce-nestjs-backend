import { ApiProperty } from '@nestjs/swagger';

export class LightweightAccountResponseDto {
  @ApiProperty({ example: 'c_77…', description: 'Customer id (existing or newly created)' })
  customer_id: string;

  @ApiProperty({ example: false, description: 'True when the phone already mapped to an account' })
  was_existing: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the returned account is lightweight (unclaimed); false for a full account',
  })
  is_lightweight: boolean;
}
