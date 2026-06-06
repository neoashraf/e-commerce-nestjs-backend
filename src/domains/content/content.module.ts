import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { PagesService } from './application/services/pages.service';
import { PageOrmEntity } from './infrastructure/persistence/typeorm/entities/page.orm-entity';
import { ContentPublicController } from './presentation/controllers/content-public.controller';
import { PagesController } from './presentation/controllers/pages.controller';

/**
 * Content (CMS) domain — the first CMS backend slice: static pages (admin CRUD + seeded BD policy pages
 * + public page-by-slug). Imports RbacModule for the admin auth/permission gate. Merchandising
 * (slides/banners/sections + homepage payload) and menus extend this module in their own briefs;
 * `PagesService` is exported so they can reuse the page read/guard.
 */
@Module({
  imports: [RbacModule, TypeOrmModule.forFeature([PageOrmEntity])],
  controllers: [PagesController, ContentPublicController],
  providers: [PagesService],
  exports: [PagesService],
})
export class ContentModule {}
