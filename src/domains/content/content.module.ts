import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoryOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductImageOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductSearchDocumentOrmEntity } from '../search/infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { RbacModule } from '../rbac/rbac.module';
import { HomepageService } from './application/services/homepage.service';
import { MenusService } from './application/services/menus.service';
import { MerchandisingService } from './application/services/merchandising.service';
import { PagesService } from './application/services/pages.service';
import { MEDIA_SERVICE } from './application/ports/media.port';
import { BannerOrmEntity } from './infrastructure/persistence/typeorm/entities/banner.orm-entity';
import { HomeSectionOrmEntity } from './infrastructure/persistence/typeorm/entities/home-section.orm-entity';
import { MenuItemOrmEntity } from './infrastructure/persistence/typeorm/entities/menu-item.orm-entity';
import { PageOrmEntity } from './infrastructure/persistence/typeorm/entities/page.orm-entity';
import { SlideOrmEntity } from './infrastructure/persistence/typeorm/entities/slide.orm-entity';
import { StubMediaService } from './infrastructure/services/stub-media.service';
import { BannersController } from './presentation/controllers/banners.controller';
import { ContentPublicController } from './presentation/controllers/content-public.controller';
import { HomeSectionsController } from './presentation/controllers/home-sections.controller';
import { MenusController } from './presentation/controllers/menus.controller';
import { PagesController } from './presentation/controllers/pages.controller';
import { SlidesController } from './presentation/controllers/slides.controller';

/**
 * Content (CMS) domain — pages, menus, and merchandising (slides/banners/home-sections) + the public
 * storefront content payload (page-by-slug + homepage). Imports RbacModule for the admin auth/permission
 * gate and the CAT read entities used to resolve link/featured targets. The media seam is a logging stub
 * until the real media/CDN service is wired.
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      PageOrmEntity,
      MenuItemOrmEntity,
      SlideOrmEntity,
      BannerOrmEntity,
      HomeSectionOrmEntity,
      // CAT read-surface (repositories only; truth stays in CAT).
      CategoryOrmEntity,
      ProductOrmEntity,
      ProductImageOrmEntity,
      // SRCH read-surface: the published mirror carries the precomputed card fields (RW6).
      ProductSearchDocumentOrmEntity,
    ]),
  ],
  controllers: [
    PagesController,
    ContentPublicController,
    MenusController,
    SlidesController,
    BannersController,
    HomeSectionsController,
  ],
  providers: [
    PagesService,
    MenusService,
    MerchandisingService,
    HomepageService,
    { provide: MEDIA_SERVICE, useClass: StubMediaService },
  ],
  exports: [PagesService, MenusService],
})
export class ContentModule {}
