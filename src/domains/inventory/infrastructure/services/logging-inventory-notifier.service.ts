import { Injectable, Logger } from '@nestjs/common';

import {
  IInventoryNotifier,
  LowStockAlertPayload,
} from '../../application/ports/inventory-notifier.port';

/**
 * Logging stub for the inventory NOTIF port. Stands in until `notif-dispatch-be` is wired (it would
 * dispatch the `inventory.low_stock_alert` event). Never throws — an alert failure must not affect the
 * stock change that triggered it. Replace the `INVENTORY_NOTIFIER` binding with a NOTIF-backed adapter
 * at integration time.
 */
@Injectable()
export class LoggingInventoryNotifier implements IInventoryNotifier {
  private readonly logger = new Logger(LoggingInventoryNotifier.name);

  async notifyLowStock(payload: LowStockAlertPayload): Promise<void> {
    this.logger.warn(
      `[inventory.low_stock_alert] sku=${payload.sku_code ?? payload.variant_id} ` +
        `available=${payload.available} threshold=${payload.threshold} ` +
        `(NOTIF stub — wire notif-dispatch-be to deliver)`,
    );
  }
}
