import { DateRange } from '../../domain/dashboard-period';
import { ReportsMetricsRptAdapter } from '../adapters/reports-metrics.rpt-adapter';
import { PaymentsDashboardRptAdapter } from '../adapters/payments-dashboard.rpt-adapter';
import { InventoryDashboardRptAdapter } from '../adapters/inventory-dashboard.rpt-adapter';
import { OrdersDashboardRptAdapter } from '../adapters/orders-dashboard.rpt-adapter';
import { CustomersDashboardRptAdapter } from '../adapters/customers-dashboard.rpt-adapter';

/**
 * DASH RPT-backed adapters (dash-rpt-wiring-be). Verifies each in-scope port method delegates to the
 * reused RPT use-case and maps its payload to the DASH contract shape (single-sourced metrics —
 * BR-DASH-2/3), and that the deferred methods stay on representative stub data (TODO-INTEGRATION).
 */
const RANGE: DateRange = { from: '2026-06-01', to: '2026-06-07' };

describe('DASH — RPT-backed adapters (FR-DASH-001/011/022, BR-DASH-2/3)', () => {
  it('ReportsMetrics: trend = Sales series, top-products = Product report rows', async () => {
    const sales = {
      execute: jest.fn().mockResolvedValue({
        series: [{ bucket: '2026-06-01', net_revenue: '90000.00', orders: 12, units: 20, aov: '7500.00' }],
        totals: { net_revenue: '90000.00', orders: 12 },
      }),
    };
    const products = {
      execute: jest.fn().mockResolvedValue([
        { product_id: 'p1', title: 'Predator Boot', units: 8, revenue: '64000.00' },
      ]),
    };
    const adapter = new ReportsMetricsRptAdapter(sales as never, products as never);

    expect(await adapter.getTrend(RANGE)).toEqual([
      { date: '2026-06-01', sales: '90000.00', orders: 12 },
    ]);
    expect(await adapter.getTopProducts(RANGE, 5)).toEqual([
      { product_id: 'p1', title: 'Predator Boot', units: 8, sales: '64000.00' },
    ]);
    expect(products.execute).toHaveBeenCalledWith(expect.anything(), 'top_sellers', 'revenue', 5);
  });

  it('Payments: revenue = Sales net_revenue (number), split = Payment report method_split', async () => {
    const sales = { execute: jest.fn().mockResolvedValue({ totals: { net_revenue: '123456.78', orders: 9 } }) };
    const payments = { execute: jest.fn().mockResolvedValue({ method_split: { cod: 5, bkash: 3, sslcommerz: 1 } }) };
    const adapter = new PaymentsDashboardRptAdapter(sales as never, payments as never);

    expect(await adapter.getRevenue(RANGE)).toBe(123456.78);
    expect(await adapter.getPaymentSplit(RANGE)).toEqual({ cod: 5, bkash: 3, sslcommerz: 1 });
  });

  it('Inventory: alert counts = lengths of the low/out-of-stock level views', async () => {
    const inventory = {
      levels: jest
        .fn()
        .mockResolvedValueOnce([{ variant_id: 'v1' }, { variant_id: 'v2' }]) // low_stock
        .mockResolvedValueOnce([{ variant_id: 'v3' }]), // out_of_stock
    };
    const adapter = new InventoryDashboardRptAdapter(inventory as never);

    expect(await adapter.getStockAlertCounts()).toEqual({ low_stock_skus: 2, out_of_stock_skus: 1 });
  });

  it('Orders: count = Sales paid/collected orders, by-status = Orders report counts; deferred stays stubbed', async () => {
    const sales = { execute: jest.fn().mockResolvedValue({ totals: { net_revenue: '0.00', orders: 21 } }) };
    const orders = {
      execute: jest.fn().mockResolvedValue({
        by_status: { delivered: { count: 13, value: '1.00' }, cancelled: { count: 2, value: '1.00' } },
      }),
    };
    const adapter = new OrdersDashboardRptAdapter(sales as never, orders as never);

    expect(await adapter.getOrderCount(RANGE)).toBe(21);
    expect(await adapter.getOrdersByStatus(RANGE)).toEqual({ delivered: 13, cancelled: 2 });
    // Deferred (no RPT equivalent) — representative data, not RPT-backed.
    expect(await adapter.getActionCounts()).toEqual({
      orders_pending_payment: 6,
      orders_to_process: 14,
      orders_to_ship: 5,
    });
    expect(await adapter.getRecentOrders(2)).toHaveLength(2);
  });

  it('Customers: new-customer count = Customer report new_vs_returning.new; recent stays stubbed', async () => {
    const customers = {
      execute: jest.fn().mockResolvedValue({ new_customers: 17, returning_customers: 4, repeat_rate: 0.19, top: [] }),
    };
    const adapter = new CustomersDashboardRptAdapter(customers as never);

    expect(await adapter.getNewCustomerCount(RANGE)).toBe(17);
    expect(customers.execute).toHaveBeenCalledWith(expect.anything(), 'new_vs_returning', 0);
    expect(await adapter.getRecentCustomers(3)).toHaveLength(3);
  });
});
