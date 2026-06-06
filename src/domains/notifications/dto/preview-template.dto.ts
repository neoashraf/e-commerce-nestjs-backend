import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/** Sample variables to render a template against for preview (FR-NOTIF-014). */
export class PreviewTemplateDto {
  @ApiProperty({
    example: { name: 'Sabbir', order_no: 'SO-100245', courier: 'Pathao', tracking_no: 'PA-99821' },
    description: 'Sample variable map; keys are placeholder names',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  variables: Record<string, string | number>;
}
