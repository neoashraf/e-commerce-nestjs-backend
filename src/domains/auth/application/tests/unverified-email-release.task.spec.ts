import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { UnverifiedEmailReleaseTask } from '../unverified-email-release.task';

/**
 * AUTH hardening test-track (auth-hardening-test AC4): the 72h release job frees
 * only unverified, never-logged-in registration emails and is idempotent
 * (FR-AUTH-045 — a single guarded UPDATE; overlapping runs are harmless).
 */
describe('Auth — UnverifiedEmailReleaseTask (FR-AUTH-045)', () => {
  let task: UnverifiedEmailReleaseTask;
  let customers: { releaseUnverifiedEmails: jest.Mock };

  beforeEach(async () => {
    customers = { releaseUnverifiedEmails: jest.fn().mockResolvedValue(0) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnverifiedEmailReleaseTask,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'AUTH_EMAIL_RELEASE_HOURS' ? '72' : '0') },
        },
      ],
    }).compile();
    task = module.get(UnverifiedEmailReleaseTask);
  });

  it('sweeps with a cutoff 72 hours in the past (AC5 window)', async () => {
    const before = Date.now();
    await task.runSweep();
    const [cutoff, now] = customers.releaseUnverifiedEmails.mock.calls[0] as [Date, Date];
    // cutoff = now - 72h, within a small scheduling tolerance.
    expect(now.getTime() - cutoff.getTime()).toBe(72 * 3600 * 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(before);
  });

  it('is idempotent — a second run just issues the same guarded UPDATE again', async () => {
    customers.releaseUnverifiedEmails.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    await task.runSweep();
    await task.runSweep();
    expect(customers.releaseUnverifiedEmails).toHaveBeenCalledTimes(2);
  });

  it('a repository failure is contained — the sweep never throws (job keeps scheduling)', async () => {
    customers.releaseUnverifiedEmails.mockRejectedValueOnce(new Error('db down'));
    await expect(task.runSweep()).resolves.toBeUndefined();
  });
});
