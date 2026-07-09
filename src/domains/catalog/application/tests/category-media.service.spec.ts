import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CategoryMediaService } from '../services/category-media.service';
import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { CategoryImageSlot } from '../../domain/enums/category-image-slot.enum';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import type { UploadedImageFile } from '../services/product-media.service';

/**
 * CategoryMediaService (FR-CAT-001/010a): single-image upload per slot — MIME/size validation,
 * Cloudinary storage reuse, and persistence to the matching URL column. Repo + Cloudinary mocked; no DB.
 */
describe('CAT — CategoryMediaService', () => {
  let service: CategoryMediaService;
  let categories: { findOne: jest.Mock; update: jest.Mock };
  let cloudinary: { upload: jest.Mock };

  const file = (over: Partial<UploadedImageFile> = {}): UploadedImageFile => ({
    originalname: 'logo.webp',
    mimetype: 'image/webp',
    size: 1024,
    buffer: Buffer.from('x'),
    ...over,
  });

  beforeEach(async () => {
    categories = { findOne: jest.fn(), update: jest.fn() };
    cloudinary = { upload: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryMediaService,
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(CategoryMediaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should store the file and persist the URL to the logo column when slot=logo', async () => {
    categories.findOne.mockResolvedValue({ id: 'c1' });
    cloudinary.upload.mockResolvedValue({ url: 'https://cdn/x.webp' });

    const result = await service.uploadImage('c1', CategoryImageSlot.LOGO, file());

    expect(cloudinary.upload).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'categories/c1', resourceType: 'image' }),
    );
    expect(categories.update).toHaveBeenCalledWith({ id: 'c1' }, { logoUrl: 'https://cdn/x.webp' });
    expect(result).toEqual({ url: 'https://cdn/x.webp', slot: CategoryImageSlot.LOGO });
  });

  it('should write image_url for slot=thumbnail and banner_url for slot=banner', async () => {
    categories.findOne.mockResolvedValue({ id: 'c1' });
    cloudinary.upload.mockResolvedValue({ url: 'https://cdn/y.webp' });

    await service.uploadImage('c1', CategoryImageSlot.THUMBNAIL, file());
    expect(categories.update).toHaveBeenLastCalledWith({ id: 'c1' }, { imageUrl: 'https://cdn/y.webp' });

    await service.uploadImage('c1', CategoryImageSlot.BANNER, file());
    expect(categories.update).toHaveBeenLastCalledWith({ id: 'c1' }, { bannerUrl: 'https://cdn/y.webp' });
  });

  it('should 400 FILE_REQUIRED when no file is provided', async () => {
    await expect(service.uploadImage('c1', CategoryImageSlot.LOGO, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });

  it('should 400 UNSUPPORTED_FILE_TYPE for a non-image mime', async () => {
    await expect(
      service.uploadImage('c1', CategoryImageSlot.LOGO, file({ mimetype: 'application/pdf' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should 400 FILE_TOO_LARGE when the file exceeds 5 MB', async () => {
    await expect(
      service.uploadImage('c1', CategoryImageSlot.LOGO, file({ size: 6 * 1024 * 1024 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should 404 CATEGORY_NOT_FOUND when the category does not exist', async () => {
    categories.findOne.mockResolvedValue(null);
    await expect(service.uploadImage('missing', CategoryImageSlot.LOGO, file())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });
});
