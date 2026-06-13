import { GetPublicCategoryTreeUseCase } from '../use-cases/get-public-category-tree.use-case';

/** Minimal domain-Category stub — only the fields the tree builder reads. */
function cat(id: string, parentId: string | null, over: Record<string, unknown> = {}) {
  return {
    id,
    parentId,
    name: `Cat ${id}`,
    slug: `slug-${id}`,
    imageUrl: null,
    ...over,
  };
}

describe('Catalog — GetPublicCategoryTreeUseCase (RW6 image_url)', () => {
  it('exposes image_url on each node (and null when unset), nesting by parent', async () => {
    const repo = {
      findPublishedMenuNodes: jest.fn().mockResolvedValue([
        cat('root', null, { imageUrl: 'https://cdn/root.webp' }),
        cat('child', 'root'), // imageUrl null
      ]),
    };
    const useCase = new GetPublicCategoryTreeUseCase(repo as never);

    const tree = await useCase.execute();

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'root', image_url: 'https://cdn/root.webp' });
    expect(tree[0].children[0]).toMatchObject({ id: 'child', image_url: null });
  });
});
