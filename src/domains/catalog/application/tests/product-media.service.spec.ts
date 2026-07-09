import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ProductMediaService } from '../services/product-media.service';
import { ProductSupportService } from '../services/product-support.service';
import { ProductVideoSource } from '../../domain/enums/product-type.enum';
import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';

/**
 * ProductMediaService gallery editing (FR-CAT-031/032/034): image reorder (exact-set guard),
 * colour-tag + alt edit (family validation), video delete, and the existing delete-image primary
 * reassignment. Repos + the transaction manager are mocked; no DB.
 */
describe('Catalog — ProductMediaService', () => {
  let service: ProductMediaService;
  let products: { findOne: jest.Mock };
  let images: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let videos: { findOne: jest.Mock; delete: jest.Mock; count: jest.Mock; save: jest.Mock; create: jest.Mock };
  let support: { getFamilyAttributes: jest.Mock };
  let txImgRepo: { delete: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let txProdRepo: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    products = { findOne: jest.fn() };
    images = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
    videos = { findOne: jest.fn(), delete: jest.fn(), count: jest.fn(), save: jest.fn(), create: jest.fn() };
    support = { getFamilyAttributes: jest.fn() };
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
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: getRepositoryToken(ProductImageOrmEntity), useValue: images },
        { provide: getRepositoryToken(ProductVideoOrmEntity), useValue: videos },
        { provide: DataSource, useValue: dataSource },
        { provide: CloudinaryService, useValue: { upload: jest.fn() } },
        { provide: ProductSupportService, useValue: support },
      ],
    }).compile();
    service = module.get(ProductMediaService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- reorderImages (FR-CAT-031) -------------------------------------------

  describe('reorderImages', () => {
    it('should 404 when the product does not exist', async () => {
      products.findOne.mockResolvedValue(null);
      await expect(service.reorderImages('missing', ['i1'])).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should 400 when ordered_ids is not the complete, exact image set', async () => {
      products.findOne.mockResolvedValue({ id: 'p1' });
      images.find.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]);
      // partial set
      await expect(service.reorderImages('p1', ['i1', 'i2'])).rejects.toBeInstanceOf(BadRequestException);
      // foreign id
      await expect(
        service.reorderImages('p1', ['i1', 'i2', 'iX']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should persist display_order from the given order and echo it back', async () => {
      products.findOne.mockResolvedValue({ id: 'p1' });
      images.find.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]);

      const result = await service.reorderImages('p1', ['i3', 'i1', 'i2']);

      expect(txImgRepo.update).toHaveBeenNthCalledWith(1, { id: 'i3', productId: 'p1' }, { displayOrder: 0 });
      expect(txImgRepo.update).toHaveBeenNthCalledWith(2, { id: 'i1', productId: 'p1' }, { displayOrder: 1 });
      expect(txImgRepo.update).toHaveBeenNthCalledWith(3, { id: 'i2', productId: 'p1' }, { displayOrder: 2 });
      expect(result).toEqual({ ordered: ['i3', 'i1', 'i2'] });
    });
  });

  // --- updateImage: alt + colour-tag (FR-CAT-032) ---------------------------

  describe('updateImage', () => {
    it('should 400 when neither alt_text nor color_option_id is provided', async () => {
      await expect(service.updateImage('p1', 'i1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should 404 when the image does not belong to the product', async () => {
      images.findOne.mockResolvedValue(null);
      await expect(
        service.updateImage('p1', 'i1', { altText: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should 400 on an empty alt_text', async () => {
      images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', altText: 'old', colorOptionId: null });
      await expect(
        service.updateImage('p1', 'i1', { altText: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should set a valid colour option for the family', async () => {
      images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', altText: 'old', colorOptionId: null });
      products.findOne.mockResolvedValue({ id: 'p1', familyId: 'fam1' });
      support.getFamilyAttributes.mockResolvedValue(
        new Map([['color', { options: [{ id: 'o-black' }, { id: 'o-white' }] }]]),
      );

      const result = await service.updateImage('p1', 'i1', { colorOptionId: 'o-black' });

      expect(images.update).toHaveBeenCalledWith({ id: 'i1' }, { colorOptionId: 'o-black' });
      expect(result).toEqual({ id: 'i1', alt_text: 'old', color_option_id: 'o-black' });
    });

    it('should 400 when color_option_id is not a valid family colour option', async () => {
      images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', altText: 'old', colorOptionId: null });
      products.findOne.mockResolvedValue({ id: 'p1', familyId: 'fam1' });
      support.getFamilyAttributes.mockResolvedValue(
        new Map([['color', { options: [{ id: 'o-black' }] }]]),
      );

      await expect(
        service.updateImage('p1', 'i1', { colorOptionId: 'o-not-a-colour' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(images.update).not.toHaveBeenCalled();
    });

    it('should clear the colour-tag when color_option_id is null (no validation)', async () => {
      images.findOne.mockResolvedValue({ id: 'i1', productId: 'p1', altText: 'old', colorOptionId: 'o-black' });

      const result = await service.updateImage('p1', 'i1', { colorOptionId: null });

      expect(support.getFamilyAttributes).not.toHaveBeenCalled();
      expect(images.update).toHaveBeenCalledWith({ id: 'i1' }, { colorOptionId: null });
      expect(result).toEqual({ id: 'i1', alt_text: 'old', color_option_id: null });
    });
  });

  // --- deleteVideo (FR-CAT-034) ---------------------------------------------

  describe('deleteVideo', () => {
    it('should 404 when the video does not belong to the product', async () => {
      videos.findOne.mockResolvedValue(null);
      await expect(service.deleteVideo('p1', 'vMissing')).rejects.toBeInstanceOf(NotFoundException);
      expect(videos.delete).not.toHaveBeenCalled();
    });

    it('should delete the video and return its id', async () => {
      videos.findOne.mockResolvedValue({ id: 'v1', productId: 'p1' });
      const result = await service.deleteVideo('p1', 'v1');
      expect(videos.delete).toHaveBeenCalledWith({ id: 'v1' });
      expect(result).toEqual({ id: 'v1' });
    });
  });

  // --- addVideo (FR-CAT-034) ------------------------------------------------

  describe('addVideo', () => {
    it('returns the stored video link (id + source + url + display_order), not just the id', async () => {
      products.findOne.mockResolvedValue({ id: 'p1' });
      videos.count.mockResolvedValue(0);
      videos.create.mockImplementation((x: Record<string, unknown>) => x);
      videos.save.mockImplementation((x: Record<string, unknown>) => Promise.resolve({ ...x, id: 'vid-1' }));

      const result = await service.addVideo({
        productId: 'p1',
        source: ProductVideoSource.URL,
        url: 'https://youtu.be/abc',
      });

      expect(result).toEqual({
        id: 'vid-1',
        source: ProductVideoSource.URL,
        url: 'https://youtu.be/abc',
        display_order: 0,
      });
    });
  });

  // --- deleteImage (FR-CAT-032/033) -----------------------------------------

  describe('deleteImage', () => {
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
});
