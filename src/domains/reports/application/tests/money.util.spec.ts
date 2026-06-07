import { divideMoney, fromPaisa, ratio, subtractMoney, sumMoney, toPaisa } from '../services/money.util';

describe('RPT — money util', () => {
  it('parses and renders 2dp money without float drift', () => {
    expect(toPaisa('92000.00')).toBe(9200000);
    expect(fromPaisa(9200000)).toBe('92000.00');
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30'); // 0.1+0.2 float trap
  });

  it('subtracts refunds from revenue (net revenue, BR-RPT-2)', () => {
    expect(subtractMoney('3120000.00', '279000.00')).toBe('2841000.00');
  });

  it('divides revenue by paid orders for AOV, 0.00 when no orders', () => {
    expect(divideMoney('2841000.00', 432)).toBe('6576.39');
    expect(divideMoney('2841000.00', 0)).toBe('0.00');
  });

  it('rounds rates to 3 dp and guards divide-by-zero', () => {
    expect(ratio(31, 432)).toBe(0.072);
    expect(ratio(0, 0)).toBe(0);
  });
});
