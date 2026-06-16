import { ExportService } from '../services/export.service';

/**
 * ExportService.listExports (rpt-export-list-be — FR-RPT-070/072, BR-RPT-6). Verifies the list is
 * scoped to the requesting admin, ordered newest-first, and paginated with skip/take — the security
 * property is the per-admin scope (an admin never sees another admin's exports/download links).
 */
describe('RPT — ExportService.listExports (FR-RPT-070/072, BR-RPT-6)', () => {
  function makeService(findAndCount: jest.Mock): ExportService {
    const exports = { findAndCount } as unknown as Parameters<typeof Reflect.construct>[1][0];
    // Only the repository is exercised by listExports; the other collaborators are unused here.
    return new ExportService(
      exports as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  }

  it('scopes to the admin, orders newest-first, and paginates (skip/take)', async () => {
    const rows = [{ id: 'rxp_7' }, { id: 'rxp_6' }];
    const findAndCount = jest.fn().mockResolvedValue([rows, 12]);
    const service = makeService(findAndCount);

    const result = await service.listExports('admin-1', 2, 5);

    expect(findAndCount).toHaveBeenCalledWith({
      where: { requestedByAdminId: 'admin-1' },
      order: { createdAt: 'DESC' },
      skip: 5, // (page 2 - 1) * limit 5
      take: 5,
    });
    expect(result).toEqual({ items: rows, page: 2, limit: 5, total: 12 });
  });

  it('first page starts at skip 0', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    await makeService(findAndCount).listExports('admin-2', 1, 20);

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestedByAdminId: 'admin-2' }, skip: 0, take: 20 }),
    );
  });
});
