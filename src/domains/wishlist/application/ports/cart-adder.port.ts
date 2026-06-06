import { Injectable } from '@nestjs/common';

import { CartService } from '../../../cart/application/cart/cart.service';

/**
 * Outbound port to CART for move-to-cart (FR-WISH-020). WISH resolves a concrete in-stock variant then
 * hands it (+ quantity) to the customer's cart; CART owns the cart entity/totals. Real impl = cart-core-be
 * (`CartService.addItem`). The customer always has a token context, so the add targets the customer cart.
 */
export interface ICartAdder {
  addToCart(customerId: string, variantId: string, quantity: number): Promise<{ cart_item_id: string }>;
}

export const CART_ADDER = Symbol('WishlistICartAdder');

/** CART-backed adapter: wraps `CartService.addItem` for the authenticated customer (WISH never touches CART infra). */
@Injectable()
export class CartItemAdder implements ICartAdder {
  constructor(private readonly cart: CartService) {}

  async addToCart(
    customerId: string,
    variantId: string,
    quantity: number,
  ): Promise<{ cart_item_id: string }> {
    const result = await this.cart.addItem({ customerId }, variantId, quantity);
    return { cart_item_id: result.item_id };
  }
}
