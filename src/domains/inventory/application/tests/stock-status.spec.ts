import { deriveStockStatus, StockStatus } from '../../domain/stock-status';

describe('Inventory — deriveStockStatus', () => {
  it('should be out_of_stock when available <= 0', () => {
    expect(deriveStockStatus(0, 3)).toBe(StockStatus.OUT_OF_STOCK);
    expect(deriveStockStatus(-1, 3)).toBe(StockStatus.OUT_OF_STOCK);
  });

  it('should be low_stock when 0 < available <= threshold', () => {
    expect(deriveStockStatus(1, 3)).toBe(StockStatus.LOW_STOCK);
    expect(deriveStockStatus(3, 3)).toBe(StockStatus.LOW_STOCK);
  });

  it('should be in_stock when available > threshold', () => {
    expect(deriveStockStatus(4, 3)).toBe(StockStatus.IN_STOCK);
    expect(deriveStockStatus(10, 0)).toBe(StockStatus.IN_STOCK);
  });
});
