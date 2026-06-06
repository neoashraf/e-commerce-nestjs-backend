import { Test, TestingModule } from '@nestjs/testing';

import { ReportPeriod } from '../../domain/report-period';
import { ORDERS_READ_MODEL } from '../ports/orders-read.port';
import { ReportCacheService } from '../services/report-cache.service';
import { GetOrdersReportUseCase } from '../use-cases/get-orders-report.use-case';

describe('RPT — GetOrdersReportUseCase (FR-RPT-012)', () => {
  let useCase: GetOrdersReportUseCase;
  let orders: { getOrdersByStatus: jest.Mock; getOrderRateCounts: jest.Mock };

  beforeEach(async () => {
    orders = {
      getOrdersByStatus: jest.fn().mockResolvedValue([
        { status: 'delivered', count: 380, value: '2500000.00' },
        { status: 'cancelled', count: 31, value: '210000.00' },
      ]),
      getOrderRateCounts: jest
        .fn()
        .mockResolvedValue({ total: 432, cancelled: 31, returned: 8 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetOrdersReportUseCase,
        ReportCacheService,
        { provide: ORDERS_READ_MODEL, useValue: orders },
      ],
    }).compile();
    useCase = module.get(GetOrdersReportUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('maps by-status counts/value and derives cancellation/return rates', async () => {
    const period = ReportPeriod.create('2026-05-01', '2026-05-31');
    const report = await useCase.execute(period);

    expect(report.by_status.delivered).toEqual({ count: 380, value: '2500000.00' });
    expect(report.by_status.cancelled).toEqual({ count: 31, value: '210000.00' });
    expect(report.cancellation_rate).toBe(0.072); // 31/432
    expect(report.return_rate).toBe(0.019); // 8/432
    expect(report.as_of).toEqual(expect.any(String));
  });
});
