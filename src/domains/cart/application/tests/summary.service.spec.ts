import { SummaryService } from '../checkout/summary.service';
import { ZoneCharge } from '../checkout/delivery-settings.service';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { OrderPaymentMethod } from '../../../orders/domain/order-enums';

const zone = (o: Partial<ZoneCharge> = {}): ZoneCharge => ({
  zone: DeliveryZone.INSIDE_DHAKA,
  delivery_charge: '70.00',
  cod_surcharge_pct: '0.00',
  cod_surcharge_flat: '0.00',
  free_shipping_threshold: null,
  cod_enabled: true,
  is_active: true,
  ...o,
});

describe('Cart — SummaryService', () => {
  const service = new SummaryService();

  it('should add ৳70 delivery for Inside Dhaka (online, no COD surcharge)', () => {
    const s = service.computeSummary('2400.00', '0.00', zone(), OrderPaymentMethod.BKASH);
    expect(s.delivery_charge).toBe('70.00');
    expect(s.cod_surcharge).toBe('0.00');
    expect(s.grand_total).toBe('2470.00');
  });

  it('should add ৳120 delivery + 1% COD surcharge Outside Dhaka for COD', () => {
    const z = zone({ zone: DeliveryZone.OUTSIDE_DHAKA, delivery_charge: '120.00', cod_surcharge_pct: '1.00' });
    const s = service.computeSummary('5000.00', '0.00', z, OrderPaymentMethod.COD);
    expect(s.delivery_charge).toBe('120.00');
    expect(s.cod_surcharge).toBe('50.00'); // 1% of 5000
    expect(s.grand_total).toBe('5170.00');
  });

  it('should NOT apply the COD surcharge for an online method', () => {
    const z = zone({ zone: DeliveryZone.OUTSIDE_DHAKA, delivery_charge: '120.00', cod_surcharge_pct: '1.00' });
    const s = service.computeSummary('5000.00', '0.00', z, OrderPaymentMethod.BKASH);
    expect(s.cod_surcharge).toBe('0.00');
    expect(s.grand_total).toBe('5120.00');
  });

  it('should subtract the discount from the taxable subtotal', () => {
    const s = service.computeSummary('5000.00', '500.00', zone(), OrderPaymentMethod.BKASH);
    expect(s.discount).toBe('500.00');
    expect(s.grand_total).toBe('4570.00'); // 5000 - 500 + 70
  });

  it('should never let the discount exceed the subtotal', () => {
    const s = service.computeSummary('1000.00', '5000.00', zone(), OrderPaymentMethod.BKASH);
    expect(s.discount).toBe('1000.00');
    expect(s.grand_total).toBe('70.00');
  });

  it('should waive delivery when the free-shipping threshold is met', () => {
    const z = zone({ free_shipping_threshold: '3000.00' });
    const s = service.computeSummary('5000.00', '0.00', z, OrderPaymentMethod.BKASH);
    expect(s.delivery_charge).toBe('0.00');
    expect(s.grand_total).toBe('5000.00');
  });

  it('should compute informational inclusive VAT (15/115) without changing the total', () => {
    const s = service.computeSummary('1150.00', '0.00', zone({ delivery_charge: '0.00' }), OrderPaymentMethod.BKASH);
    // VAT = round(1150 × 15 / 115) = 150; grand total unchanged (VAT-inclusive prices).
    expect(s.vat).toBe('150.00');
    expect(s.grand_total).toBe('1150.00');
  });
});
