import { SizeGuideService } from '../services/size-guide.service';

describe('Catalog — SizeGuideService.resolveForCategory (RW6)', () => {
  function build(
    categories: Record<string, { parentId: string | null }>,
    guides: Record<string, { measureNote: string; unit: string; rows: { uk: string; foot: string }[] }>,
  ) {
    const guideRepo = {
      // Return every seeded guide; the service filters by the chain + nearest-wins ordering itself,
      // so the stub need not interpret TypeORM's In() internals.
      find: jest.fn(async () =>
        Object.entries(guides).map(([categoryId, g]) => ({ categoryId, ...g })),
      ),
    };
    const catRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        categories[where.id] ? { id: where.id, parentId: categories[where.id].parentId } : null,
      ),
    };
    return new SizeGuideService(guideRepo as never, catRepo as never);
  }

  const CHART = { measureNote: 'm', unit: 'cm', rows: [{ uk: '7', foot: '25.4' }] };

  it('returns null when the product has no primary category', async () => {
    const svc = build({}, {});
    expect(await svc.resolveForCategory(null)).toBeNull();
  });

  it('returns null when no category in the chain has a chart', async () => {
    const svc = build({ leaf: { parentId: 'root' }, root: { parentId: null } }, {});
    expect(await svc.resolveForCategory('leaf')).toBeNull();
  });

  it('inherits the parent chart when the leaf has none', async () => {
    const svc = build({ leaf: { parentId: 'root' }, root: { parentId: null } }, { root: CHART });
    const guide = await svc.resolveForCategory('leaf');
    expect(guide).toEqual({ measure_note: 'm', unit: 'cm', rows: [{ uk: '7', foot: '25.4' }] });
  });

  it('prefers the nearest (leaf) chart over an ancestor chart', async () => {
    const leafChart = { measureNote: 'leaf', unit: 'cm', rows: [{ uk: '8', foot: '26.3' }] };
    const svc = build(
      { leaf: { parentId: 'root' }, root: { parentId: null } },
      { leaf: leafChart, root: CHART },
    );
    const guide = await svc.resolveForCategory('leaf');
    expect(guide?.measure_note).toBe('leaf');
  });
});
