import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { AuthenticatedCustomer } from '../../../../shared/decorators/current-customer.decorator';
import {
  CartActor,
  CartService,
  CartView,
} from '../../application/cart/cart.service';
import { OptionalCustomerGuard } from '../guards/optional-customer.guard';
import { AddItemDto, AddItemResultDto, MergeCartDto, UpdateItemDto } from '../dto/cart.dto';

/**
 * Cart core endpoints (FR-CART-001–009; contract: Cart). Public shopper surface — accepts **either** a
 * customer access token (optional) **or** an `X-Cart-Token` guest token; a write with neither mints a
 * new guest cart + token, returned via the `X-Cart-Token` response header. No RBAC gate. Add increments
 * an existing line; add/update cap at live INV stock; prices read live from CAT (BR-CART-1).
 */
@ApiTags('Cart')
@ApiHeader({ name: 'X-Cart-Token', required: false, description: 'Guest cart token (opaque).' })
@UseGuards(OptionalCustomerGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'View the cart with a live subtotal' })
  @ApiOkResponse({ description: 'Cart view with items + summary' })
  async getCart(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartView> {
    const view = await this.cart.getCart(this.actor(req, cartToken));
    this.echoToken(res, view.cart_token);
    return view;
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an item (increments an existing line; caps at stock)' })
  @ApiCreatedResponse({ type: AddItemResultDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK { available }' })
  @ApiBadRequestResponse({ description: 'VARIANT_NOT_SELLABLE / LINE_QTY_LIMIT / CART_LINE_LIMIT' })
  async addItem(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() dto: AddItemDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AddItemResultDto> {
    const result = await this.cart.addItem(this.actor(req, cartToken), dto.variant_id, dto.quantity);
    this.echoToken(res, result.cart_token);
    return { item_id: result.item_id, quantity: result.quantity, capped: result.capped };
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update a line quantity (0 removes it; caps at stock)' })
  @ApiOkResponse({ description: 'Updated line + recomputed summary (or removed)' })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK { available }' })
  updateItem(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.cart.updateItem(this.actor(req, cartToken), itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a line' })
  @ApiNoContentResponse()
  async removeItem(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.cart.removeItem(this.actor(req, cartToken), itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all lines from the cart' })
  @ApiNoContentResponse()
  async clear(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
  ): Promise<void> {
    await this.cart.clear(this.actor(req, cartToken));
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge a guest cart into the customer cart on login (idempotent)' })
  @ApiOkResponse({ description: '{ merged_lines, capped_lines, summary }' })
  @ApiBadRequestResponse({ description: 'CUSTOMER_REQUIRED' })
  merge(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() dto: MergeCartDto,
  ) {
    return this.cart.merge(this.actor(req, cartToken), dto.cart_token);
  }

  // --- helpers ---

  private actor(req: Request, cartToken: string | undefined): CartActor {
    const user = req.user as AuthenticatedCustomer | undefined;
    return { customerId: user?.customerId ?? null, cartToken: cartToken ?? null };
  }

  /** Surface the (possibly minted) cart token so the FE can persist it. */
  private echoToken(res: Response, token: string | null | undefined): void {
    if (token) res.setHeader('X-Cart-Token', token);
  }
}
