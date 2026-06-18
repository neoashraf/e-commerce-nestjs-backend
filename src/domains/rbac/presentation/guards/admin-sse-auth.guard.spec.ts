import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AdminSseAuthGuard } from './admin-sse-auth.guard';

const ctxWith = (query: Record<string, unknown>): { ctx: ExecutionContext; req: Record<string, unknown> } => {
  const req: Record<string, unknown> = { query };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
};

describe('RBAC — AdminSseAuthGuard (SSE query-token auth)', () => {
  let guard: AdminSseAuthGuard;
  let verifier: { verify: jest.Mock };

  beforeEach(() => {
    verifier = { verify: jest.fn() };
    guard = new AdminSseAuthGuard(verifier as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('passes the ?token= query param to the verifier', async () => {
    verifier.verify.mockResolvedValue({ adminId: 'a1', roleId: 'r1' });
    const { ctx } = ctxWith({ token: 'good' });
    await guard.canActivate(ctx);
    expect(verifier.verify).toHaveBeenCalledWith('good');
  });

  it('rejects when the verifier rejects the token (missing/invalid/expired/non-admin)', async () => {
    verifier.verify.mockResolvedValue(null);
    const { ctx } = ctxWith({ token: 'bad' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects (passing undefined to the verifier) when no token query param is present', async () => {
    verifier.verify.mockResolvedValue(null);
    const { ctx } = ctxWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verify).toHaveBeenCalledWith(undefined);
  });

  it('binds the request to the verified admin and allows the connection', async () => {
    verifier.verify.mockResolvedValue({ adminId: 'a1', roleId: 'r1' });
    const { ctx, req } = ctxWith({ token: 'good' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ adminId: 'a1', roleId: 'r1' });
  });
});
