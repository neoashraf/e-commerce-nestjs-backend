import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoryOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { RbacModule } from '../rbac/rbac.module';
import { MenusService } from './application/services/menus.service';
import { PagesService } from './application/services/pages.service';
import { MenuItemOrmEntity } from './infrastructure/persistence/typeorm/entities/menu-item.orm-entity';
import { PageOrmEntity } from './infrastructure/persistence/typeorm/entities/page.orm-entity';
import { ContentPublicController } from './presentation/controllers/content-public.controller';
import { MenusController } from './presentation/controllers/menus.controller';
import { PagesController } from './presentation/controllers/pages.controller';

/**
 * Content (CMS) domain — the first CMS backend slice: static pages (admin CRUD + seeded BD policy pages
 * + public page-by-slug). Imports RbacModule for the admin auth/permission gate. Merchandising
 * (slides/banners/sections + homepage payload) and menus extend this module in their own briefs;
 * `PagesService` is exported so they can reuse the page read/guard.
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([PageOrmEntity, MenuItemOrmEntity, CategoryOrmEntity]),
  ],
  controllers: [PagesController, ContentPublicController, MenusController],
  providers: [PagesService, MenusService],
  // MenusService is exported so cms-merchandising-be's homepage payload can read the published menus.
  exports: [PagesService, MenusService],
})
export class ContentModule {}
