import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';

import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { SkipEnvelope } from '../../../../shared/decorators/skip-envelope.decorator';
import { WishlistService } from '../../application/wishlist.service';
import { AddItemDto } from '../dto/add-item.dto';
import { MembershipDto } from '../dto/membership.dto';
import { MergeWishlistDto } from '../dto/merge-wishlist.dto';
import { MoveToCartDto } from '../dto/move-to-cart.dto';
import {
  AddItemResultDto,
  MembershipResultDto,
  MergeResultDto,
  MoveToCartResultDto,
  WishlistListResponseDto,
} from '../dto/wishlist.response';

/**
 * Wishlist endpoints (FR-WISH-001–040; contract: docs/api-contracts/07-wishlist.md). All under
 * `/api/v1/me/wishlist` and require a **customer** access token (§11 auth). Prices/availability are
 * resolved live from CAT/INV (BR-WISH-2). The `{ data }` envelope is applied globally; the list adds a
 * sibling `meta: { total, max_items }`.
 */
@ApiTags('Wishlist')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing/invalid customer token' })
@UseGuards(JwtCustomerGuard)
@Controller('me/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @SkipEnvelope() // contract: { data: [...], meta: { total, max_items } } (non-pagination meta)
  @ApiOperation({ summary: 'View the wishlist with live price/availability (most-recent-first)' })
  @ApiOkResponse({ type: WishlistListResponseDto })
  async list(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<WishlistListResponseDto> {
    const view = await this.wishlist.getWishlist(customer.customerId);
    return { data: view.items, meta: { total: view.total, max_items: view.max_items } };
  }

  @Post()
  @ApiOperation({ summary: 'Add a product (idempotent; 200 with already_present on repeat)' })
  @ApiCreatedResponse({ type: AddItemResultDto, description: 'Added (201) or already present (200)' })
  @ApiNotFoundResponse({ description: 'Product not found or not published' })
  @ApiBadRequestResponse({ description: 'Preferred variant not on the product or disabled' })
  @ApiConflictResponse({ description: 'WISHLIST_FULL { max_items }' })
  async add(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: AddItemDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AddItemResultDto> {
    const { result, created } = await this.wishlist.addItem(
      customer.customerId,
      dto.product_id,
      dto.preferred_variant_id ?? null,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from the wishlist' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Item not found in the caller wishlist' })
  async remove(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.wishlist.removeItem(customer.customerId, itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the entire wishlist' })
  @ApiNoContentResponse()
  async clear(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<void> {
    await this.wishlist.clear(customer.customerId);
  }

  @Post(':itemId/move-to-cart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move an item to the cart (keeps it by default)' })
  @ApiOkResponse({ type: MoveToCartResultDto })
  @ApiNotFoundResponse({ description: 'Item not found in the caller wishlist' })
  @ApiConflictResponse({ description: 'VARIANT_NEEDED (no resolvable variant) or OUT_OF_STOCK' })
  moveToCart(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: MoveToCartDto,
  ): Promise<MoveToCartResultDto> {
    return this.wishlist.moveToCart(customer.customerId, itemId, dto);
  }

  @Post('membership')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Membership state for a set of product ids (heart rendering)' })
  @ApiOkResponse({ type: MembershipResultDto })
  membership(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: MembershipDto,
  ): Promise<Record<string, boolean>> {
    return this.wishlist.membership(customer.customerId, dto.product_ids);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge a guest wishlist into the account (dedupe, drop unpublished, honor cap)' })
  @ApiOkResponse({ type: MergeResultDto })
  merge(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: MergeWishlistDto,
  ): Promise<MergeResultDto> {
    return this.wishlist.merge(customer.customerId, dto.items);
  }
}
