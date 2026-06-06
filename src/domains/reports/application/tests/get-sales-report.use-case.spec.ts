import { Test, TestingModule } from '@nestjs/testing';

import { ReportBucket, ReportPeriod, SalesBreakdown } from '../../domain/report-period';
import { ORDERS_READ_MODEL } from '../ports/orders-read.port';
import { PAYMENTS_READ_MODEL } from '../ports/payments-read.port';
import { ReportCacheService } from '../services/report-cache.service';
import { GetSalesReportUseCase } from '../use-cases/get-sales-report.use-case';

describe('RPT — GetSalesReportUseCase (FR-RPT-010/011)', () => {
  let useCase: GetSalesReportUseCase;
  let orders: {
    getPaidOrdersSeries: jest.Mock;
    getPaidOrdersTotals: jest.Mock;
    getSalesBreakdown: jest.Mock;
    getOrdersByStatus: jest.Mock;
    getOrderRateCounts: jest.Mock;
  };
  let payments: { getRefundsSeries: jest.Mock; getRefundsTotal: jest.Mock };

  beforeEach(async () => {
    orders = {
      getPaidOrdersSeries: jest.fn().mockResolvedValue([
        { bucket: '2026-05-01', revenue: '100000.00', orders: 10, units: 12 },
      ]),
      getPaidOrdersTotals: jest.fn().mockResolvedValue({
        revenue: '3120000.00',
        gross_placed_value: '3400000.00',
        orders: 432,
        units: 511,
      }),
      getSalesBreakdown: jest
        .fn()
        .mockResolvedValue({ cod: '1700000.00', bkash: '780000.00', sslcommerz: '361000.00' }),
      getOrdersByStatus: jest.fn(),
      getOrderRateCounts: jest.fn(),
    };
    payments = {
      getRefundsSeries: jest
        .fn()
        .mockResolvedValue([{ bucket: '2026-05-01', amount: '5000.00' }]),
      getRefundsTotal: jest.fn().mockResolvedValue('279000.00'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetSalesReportUseCase,
        ReportCacheService,
        { provide: ORDERS_READ_MODEL, useValue: orders },
        { provide: PAYMENTS_READ_MODEL, useValue: payments },
      ],
    }).compile();
    useCase = module.get(GetSalesReportUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('nets revenue of refunds in totals and computes AOV (BR-RPT-2/3)', async () => {
    const period = ReportPeriod.create('2026-05-01', '2026-05-31', ReportBucket.DAY);
    const report = await useCase.execute(period, SalesBreakdown.PAYMENT_METHOD);

    expect(report.totals.net_revenue).toBe('2841000.00'); // 3,120,000 − 279,000
    expect(report.totals.gross_placed_value).toBe('3400000.00'); // distinct from revenue
    expect(report.totals.aov).toBe('6576.39'); // 2,841,000 / 432
    expect(report.breakdown).toEqual({
      payment_method: { cod: '1700000.00', bkash: '780000.00', sslcommerz: '361000.00' },
    });
    expect(report.as_of).toEqual(expect.any(String));
  });

  it('nets each series bucket: net = paid − refunds in that bucket (§12.3)', async () => {
    const period = ReportPeriod.create('2026-05-01', '2026-05-31', ReportBucket.DAY);
    const report = await useCase.execute(period);
    expect(report.series[0]).toEqual({
      bucket: '2026-05-01',
      net_revenue: '95000.00', // 100,000 − 5,000
      orders: 10,
      units: 12,
      aov: '9500.00',
    });
    expect(report.breakdown).toEqual({}); // none requested
  });
});
