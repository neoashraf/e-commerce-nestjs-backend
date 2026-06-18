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

  it('Payments: revenue = Sales net_revenue, AOV = Sales aov, split = Payment report method_split', async () => {
    const sales = {
      execute: jest.fn().mockResolvedValue({ totals: { net_revenue: '123456.78', orders: 9, aov: '13717.42' } }),
    };
    const payments = { execute: jest.fn().mockResolvedValue({ method_split: { cod: 5, bkash: 3, sslcommerz: 1 } }) };
    const adapter = new PaymentsDashboardRptAdapter(sales as never, payments as never);

    expect(await adapter.getRevenue(RANGE)).toBe(123456.78);
    expect(await adapter.getAvgOrderValue(RANGE)).toBe(13717.42);
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

  it('Orders: KPI count = placed orders (sum of by-status); action counts + recent from the ORD read side', async () => {
    const orders = {
      execute: jest.fn().mockResolvedValue({
        by_status: {
          confirmed: { count: 2, value: '1.00' },
          delivered: { count: 13, value: '1.00' },
          cancelled: { count: 2, value: '1.00' },
        },
      }),
    };
    const recent = [
      { order_no: 'SO-100247', customer: 'Karim', grand_total: '4250.00', status: 'pending_payment', placed_at: '2026-06-18T08:41:00Z' },
    ];
    const orderQuery = {
      getActionCounts: jest.fn().mockResolvedValue({ pendingPayment: 3, toProcess: 8, toShip: 2 }),
      getRecentOrders: jest.fn().mockResolvedValue(recent),
    };
    const adapter = new OrdersDashboardRptAdapter(orders as never, orderQuery as never);

    // Orders KPI = placed orders = 2 + 13 + 2; reconciles with the orders-by-status breakdown.
    expect(await adapter.getOrderCount(RANGE)).toBe(17);
    expect(await adapter.getOrdersByStatus(RANGE)).toEqual({ confirmed: 2, delivered: 13, cancelled: 2 });
    // Live operational state from ORD — maps to the contract's snake_case alert keys.
    expect(await adapter.getActionCounts()).toEqual({
      orders_pending_payment: 3,
      orders_to_process: 8,
      orders_to_ship: 2,
    });
    expect(await adapter.getRecentOrders(5)).toEqual(recent);
    expect(orderQuery.getRecentOrders).toHaveBeenCalledWith(5);
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
