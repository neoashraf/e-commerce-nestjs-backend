import { ProductPublishValidator } from '../services/product-publish.validator';
import { ProductType } from '../../domain/enums/product-type.enum';

describe('Catalog — ProductPublishValidator', () => {
  let validator: ProductPublishValidator;

  beforeEach(() => {
    validator = new ProductPublishValidator();
  });

  it('should report no details when the publish trinity is satisfied', () => {
    const details = validator.validate({
      type: ProductType.SIMPLE,
      hasPrimaryImage: true,
      enabledVariantCount: 1,
      missingRequiredAttributeCodes: [],
    });
    expect(details).toEqual([]);
  });

  it('should report no_primary_image when no primary image is set', () => {
    const details = validator.validate({
      type: ProductType.SIMPLE,
      hasPrimaryImage: false,
      enabledVariantCount: 1,
      missingRequiredAttributeCodes: [],
    });
    expect(details).toContain('no_primary_image');
  });

  it('should report no_enabled_variant when there is no enabled variant', () => {
    const details = validator.validate({
      type: ProductType.CONFIGURABLE,
      hasPrimaryImage: true,
      enabledVariantCount: 0,
      missingRequiredAttributeCodes: [],
    });
    expect(details).toContain('no_enabled_variant');
  });

  it('should list missing required attributes joined by comma', () => {
    const details = validator.validate({
      type: ProductType.SIMPLE,
      hasPrimaryImage: true,
      enabledVariantCount: 1,
      missingRequiredAttributeCodes: ['gender', 'tier'],
    });
    expect(details).toContain('missing_required_attributes:gender,tier');
  });

  it('should accumulate every failing rule', () => {
    const details = validator.validate({
      type: ProductType.CONFIGURABLE,
      hasPrimaryImage: false,
      enabledVariantCount: 0,
      missingRequiredAttributeCodes: ['gender'],
    });
    expect(details).toEqual([
      'no_primary_image',
      'no_enabled_variant',
      'missing_required_attributes:gender',
    ]);
  });
});
