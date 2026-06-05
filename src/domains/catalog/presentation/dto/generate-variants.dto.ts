import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';

/** One configurable axis: an attribute code + the option ids to expand into variants. */
export class ConfigurableAttributeInput {
  @ApiProperty({ example: 'color', description: 'Attribute code (must be is_configurable + select)' })
  @IsString()
  code: string;

  @ApiProperty({ type: [String], example: ['o-black', 'o-white'], description: 'Option ids to expand' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  option_ids: string[];
}

/**
 * Set a product's configurable attributes and generate the variant matrix (FR-CAT-020/021/027).
 * ≥1 axis; each axis ≥1 option. Re-running appends only the new combinations.
 */
export class GenerateVariantsDto {
  @ApiProperty({ type: [ConfigurableAttributeInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfigurableAttributeInput)
  configurable_attributes: ConfigurableAttributeInput[];
}
