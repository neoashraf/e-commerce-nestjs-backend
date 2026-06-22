import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../rbac/presentation/decorators/current-admin.decorator';
import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { Paginated } from '../../shared/dto/paginated';
import { CustomersService } from './customers.service';
import { CustomerExportService } from './customer-export.service';
import { CustomerTagsService } from './customer-tags.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { SuspendCustomerDto } from './dto/suspend.dto';
import { CreateNoteDto } from './dto/note.dto';
import { AssignTagDto } from './dto/tag.dto';
import { CreateExportDto } from './dto/export.dto';
import {
  AdminWishlistItemDto,
  CreateNoteResultDto,
  CustomerListItemDto,
  CustomerProfileDto,
  ExportJobDto,
  ExportStatusDto,
  NoteDto,
  ReactivateResultDto,
  SuspendResultDto,
} from './dto/customer-responses';

/**
 * Admin customer management (CUST, SRS 12; contract docs/api-contracts/12-customers.md). All routes
 * require an admin token + a `customers.*` permission; the `{ data }` / `{ data, meta }` envelope is
 * applied globally. Read-only over customer-owned data — the only writes are notes, tags, and the
 * suspend/reactivate actions delegated to AUTH.
 */
@ApiTags('Customers — Admin')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly tags: CustomerTagsService,
    private readonly exporter: CustomerExportService,
  ) {}

  @Get()
  @Requires('customers.customer.read')
  @ApiOperation({ summary: 'List/search customers (+ optional guest contacts), with per-row aggregates' })
  @ApiOkResponse({ type: [CustomerListItemDto] })
  list(@Query() query: ListCustomersQueryDto): Promise<Paginated<CustomerListItemDto>> {
    return this.customers.list(query);
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @Requires('customers.customer.export')
  @ApiOperation({ summary: 'Export the filtered customer list to CSV (async)' })
  @ApiAcceptedResponse({ type: ExportJobDto })
  createExport(
    @Body() dto: CreateExportDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ExportJobDto> {
    return this.exporter.createExport({
      adminId: admin.adminId,
      filters: (dto.filters ?? {}) as Record<string, unknown>,
      fields: dto.fields,
    });
  }

  @Get('export/:exportId')
  @Requires('customers.customer.export')
  @ApiParam({ name: 'exportId', example: 'exp_12' })
  @ApiOperation({ summary: 'Export status / download link' })
  @ApiOkResponse({ type: ExportStatusDto })
  @ApiNotFoundResponse({ description: 'EXPORT_NOT_FOUND' })
  getExport(@Param('exportId') exportId: string): Promise<ExportStatusDto> {
    return this.exporter.getExport(exportId);
  }

  @Get(':customerId')
  @Requires('customers.customer.read')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'Customer 360 profile (identity, addresses, orders/LTV, leads, wishlist)' })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  getProfile(@Param('customerId') customerId: string): Promise<CustomerProfileDto> {
    return this.customers.getProfile(customerId);
  }

  @Get(':customerId/wishlist')
  @Requires('customers.customer.read')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: "A customer's wishlist items (live price + availability; FR-CUST-013)" })
  @ApiOkResponse({ type: AdminWishlistItemDto, isArray: true })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  getWishlist(@Param('customerId') customerId: string): Promise<AdminWishlistItemDto[]> {
    return this.customers.getWishlist(customerId);
  }

  @Post(':customerId/suspend')
  @HttpCode(HttpStatus.OK)
  @Requires('customers.customer.suspend')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'Suspend a customer (status + session revoke via AUTH; audited)' })
  @ApiOkResponse({ type: SuspendResultDto })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CUSTOMER_DELETED — account is deleted/anonymized' })
  suspend(
    @Param('customerId') customerId: string,
    @Body() dto: SuspendCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<SuspendResultDto> {
    return this.customers.suspend(customerId, admin.adminId, dto.reason);
  }

  @Post(':customerId/reactivate')
  @HttpCode(HttpStatus.OK)
  @Requires('customers.customer.suspend')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'Reactivate a suspended customer (audited)' })
  @ApiOkResponse({ type: ReactivateResultDto })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CUSTOMER_DELETED — account is deleted/anonymized' })
  reactivate(
    @Param('customerId') customerId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ReactivateResultDto> {
    return this.customers.reactivate(customerId, admin.adminId);
  }

  @Get(':customerId/notes')
  @Requires('customers.customer.read')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'List a customer’s internal notes' })
  @ApiOkResponse({ type: [NoteDto] })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  listNotes(@Param('customerId') customerId: string): Promise<NoteDto[]> {
    return this.customers.listNotes(customerId);
  }

  @Post(':customerId/notes')
  @HttpCode(HttpStatus.CREATED)
  @Requires('customers.customer.note')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'Add an internal note (never visible to the customer)' })
  @ApiCreatedResponse({ type: CreateNoteResultDto })
  @ApiNotFoundResponse({ description: 'CUSTOMER_NOT_FOUND' })
  addNote(
    @Param('customerId') customerId: string,
    @Body() dto: CreateNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CreateNoteResultDto> {
    return this.customers.addNote(customerId, admin.adminId, dto.body);
  }

  @Post(':customerId/tags')
  @HttpCode(HttpStatus.OK)
  @Requires('customers.tag.manage')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiOperation({ summary: 'Assign a tag to a customer (idempotent)' })
  @ApiOkResponse({ description: 'Tag assigned (no-op if already present)' })
  @ApiNotFoundResponse({ description: 'TAG_NOT_FOUND' })
  async assignTag(
    @Param('customerId') customerId: string,
    @Body() dto: AssignTagDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<{ customer_id: string; tag_id: string }> {
    await this.tags.assign(customerId, dto.tag_id, admin.adminId);
    return { customer_id: customerId, tag_id: dto.tag_id };
  }

  @Delete(':customerId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires('customers.tag.manage')
  @ApiParam({ name: 'customerId', example: 'c_77…' })
  @ApiParam({ name: 'tagId', example: 'tag_vip' })
  @ApiOperation({ summary: 'Unassign a tag from a customer (idempotent)' })
  @ApiNoContentResponse({ description: 'Tag removed' })
  async unassignTag(
    @Param('customerId') customerId: string,
    @Param('tagId') tagId: string,
  ): Promise<void> {
    await this.tags.unassign(customerId, tagId);
  }
}
