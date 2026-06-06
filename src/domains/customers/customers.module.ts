import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { CustomerAccountActionEntity } from './entities/customer-account-action.entity';
import { CustomerExportEntity } from './entities/customer-export.entity';
import { CustomerNoteEntity } from './entities/customer-note.entity';
import { CustomerTagAssignmentEntity } from './entities/customer-tag-assignment.entity';
import { CustomerTagEntity } from './entities/customer-tag.entity';
import { CustomersController } from './customers.controller';
import { CustomerTagsController } from './customer-tags.controller';
import { CustomersService } from './customers.service';
import { CustomerTagsService } from './customer-tags.service';
import { CustomerExportService } from './customer-export.service';
import { CustomerExportFileStore } from './customer-export-file.store';
import { CustomerDirectoryReader } from './customers-directory.reader';
import { AUTH_CUSTOMER_GATEWAY, AuthCustomerAdapter } from './ports/auth-customer.port';
import { ORDER_STATS, OrderStatsAdapter } from './ports/order-stats.port';
import { LEAD_SOURCE, LeadSourceAdapter } from './ports/lead-source.port';
import { WISHLIST_SOURCE, WishlistSourceAdapter } from './ports/wishlist-source.port';

/**
 * Customer management (CUST, SRS 12). The admin customer surface: directory, 360 profile, account
 * actions, notes, tags, and async export. CUST owns only the annotation/action/export tables; identity,
 * orders, leads, and wishlist are read through ports backed by real adapters (the source modules are
 * merged). RbacModule (imported via `forwardRef()` per the project convention) supplies the admin auth
 * guard, the permission gate, and the audit writer used by the account actions and export.
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      CustomerNoteEntity,
      CustomerTagEntity,
      CustomerTagAssignmentEntity,
      CustomerAccountActionEntity,
      CustomerExportEntity,
    ]),
  ],
  controllers: [CustomersController, CustomerTagsController],
  providers: [
    CustomersService,
    CustomerTagsService,
    CustomerExportService,
    CustomerExportFileStore,
    CustomerDirectoryReader,
    { provide: AUTH_CUSTOMER_GATEWAY, useClass: AuthCustomerAdapter },
    { provide: ORDER_STATS, useClass: OrderStatsAdapter },
    { provide: LEAD_SOURCE, useClass: LeadSourceAdapter },
    { provide: WISHLIST_SOURCE, useClass: WishlistSourceAdapter },
  ],
})
export class CustomersModule {}
