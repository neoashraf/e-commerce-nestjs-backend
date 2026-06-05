import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AuditResult } from '../../domain/enums/audit-result.enum';

export class AuditActorDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  name: string;
}

export class AuditEntryDto {
  @ApiProperty({ example: 'au_1' })
  id: string;

  @ApiPropertyOptional({ type: AuditActorDto, nullable: true })
  actor: AuditActorDto | null;

  @ApiProperty({ example: 'orders.order.refund' })
  action: string;

  @ApiPropertyOptional({ example: 'Order', nullable: true })
  entity_type: string | null;

  @ApiPropertyOptional({ example: 'ord_88', nullable: true })
  entity_id: string | null;

  @ApiProperty({ enum: AuditResult })
  result: AuditResult;

  @ApiProperty({ example: { amount: '12500.00', reason: 'customer_request' } })
  summary: Record<string, unknown>;

  @ApiProperty({ example: '2026-06-03T10:02:00.000Z' })
  created_at: string;
}
