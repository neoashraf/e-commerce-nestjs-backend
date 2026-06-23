import { ApiProperty } from '@nestjs/swagger';

/**
 * One entry in the attributed order notes thread (FR-ORD-072b). Returned by
 * `GET /admin/orders/{orderNo}/notes` and embedded in the admin order detail.
 */
export class OrderNoteEntryDto {
  @ApiProperty({ example: 'note_3', description: 'UUID for admin notes; "note_customer" for the customer note.' })
  id: string;

  @ApiProperty({ example: 'admin', enum: ['admin', 'customer'] })
  author_type: 'admin' | 'customer';

  @ApiProperty({ example: 'Rahim (Order Manager)', description: 'Admin display name + role, or customer name.' })
  author_name: string;

  @ApiProperty({ example: 'Customer called to confirm size.' })
  body: string;

  @ApiProperty({ example: '2026-06-04T11:00:00Z' })
  created_at: string;
}
