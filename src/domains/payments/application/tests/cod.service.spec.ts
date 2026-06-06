import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CodService } from '../services/cod.service';
import { ReconService } from '../services/recon.service';
import { PaymentStatus } from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';

const NOW = new Date('2026-06-05T16:30:00Z');

describe('Payments — CodService', () => {
  let service: CodService;
  let payments: { findOne: jest.Mock; save: jest.Mock };
  let recon: { recordTxn: jest.Mock };

  beforeEach(async () => {
    payments = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    recon = { recordTxn: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodService,
        { provide: getRepositoryToken(PaymentOrmEntity), useValue: payments },
        { provide: ReconService, useValue: recon },
      ],
    }).compile();

    service = module.get(CodService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark a cod_pending payment collected with amount, admin and time', async () => {
    payments.findOne.mockResolvedValue({ id: 'pay_2', method: 'cod', status: PaymentStatus.COD_PENDING });
    const result = await service.markCollected('pay_2', '12241.20', 'admin_1', NOW);
    expect(result.status).toBe(PaymentStatus.COD_COLLECTED);
    expect(payments.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.COD_COLLECTED, collectedByAdminId: 'admin_1', collectedAt: NOW }),
    );
    expect(recon.recordTxn).toHaveBeenCalled();
  });

  it('should reject collecting a payment that is not cod_pending (409)', async () => {
    payments.findOne.mockResolvedValue({ id: 'pay_2', status: PaymentStatus.PAID });
    await expect(service.markCollected('pay_2', '100.00', null, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('should mark a cod_pending payment failed (refusal)', async () => {
    payments.findOne.mockResolvedValue({ id: 'pay_2', method: 'cod', status: PaymentStatus.COD_PENDING });
    const result = await service.markFailed('pay_2', 'customer_refused', NOW);
    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  it('should throw PAYMENT_NOT_FOUND for an unknown payment', async () => {
    payments.findOne.mockResolvedValue(null);
    await expect(service.markFailed('nope', 'x', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
