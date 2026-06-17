import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ProductMediaService } from '../services/product-media.service';
import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';

/**
 * ProductMediaService.deleteImage (FR-CAT-032/033): 404 when the image isn't on the product,
 * hard-delete of a non-primary image (primary unchanged), and primary reassignment / clearing
 * when the primary is removed.
 */
describe('Catalog — ProductMediaService.deleteImage', () => {
  let service: ProductMediaService;
  let images: { findOne: jest.Mock };
  let txImgRepo: { delete: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let txProdRepo: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    images = { findOne: jest.fn() };
    txImgRepo = { delete: jest.fn(), findOne: jest.fn(), update: jest.fn() };
    txProdRepo = { findOne: jest.fn(), update: jest.fn() };

    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === ProductImageOrmEntity ? txImgRepo : txProdRepo,
      ),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductMediaService,
        { provide: getRepositoryToken(ProductOrmEntity), useValue: {} },
        { provide: getRepositoryToken(ProductImageOrmEntity), useValue: images },
        { provide: getRepositoryToken(ProductVideoOrmEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: CloudinaryService, useValue: { upload: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductMediaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should 404 when the image does not belong to the product', async () => {
    images.findOne.mockResolvedValue(null);
    await expect(service.deleteImage('p1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(txImgRepo.delete).not.toHaveBeenCalled();
  });

  it('should delete a non-primary image and leave the primary unchanged', async () => {
    images.findOne.mockResolvedValue({ id: 'i2', productId: 'p1', isPrimary: false });
    txProdRepo.findOne.mockResolvedValue({ id: 'p1', primaryImageId: 'i1' });

    const result = await service.deleteImage('p1', 'i2');

    expect(txImgRepo.delete).toHaveBeenCalledWith({ id: 'i2' });
    expect(txProdRepo.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'i2', primary_image_id: 'i1' });
  });

  it('should promote the next image when the deleted one was primary', async () => {
    images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', isPrimary: true });
    txImgRepo.findOne.mockResolvedValue({ id: 'i2' });

    const result = await service.deleteImage('p1', 'i1');

    expect(txImgRepo.delete).toHaveBeenCalledWith({ id: 'i1' });
    expect(txImgRepo.update).toHaveBeenCalledWith({ id: 'i2' }, { isPrimary: true });
    expect(txProdRepo.update).toHaveBeenCalledWith({ id: 'p1' }, { primaryImageId: 'i2' });
    expect(result).toEqual({ id: 'i1', primary_image_id: 'i2' });
  });

  it('should clear the primary when the last image is deleted', async () => {
    images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', isPrimary: true });
    txImgRepo.findOne.mockResolvedValue(null);

    const result = await service.deleteImage('p1', 'i1');

    expect(txProdRepo.update).toHaveBeenCalledWith({ id: 'p1' }, { primaryImageId: null });
    expect(result).toEqual({ id: 'i1', primary_image_id: null });
  });
});
