import { BadRequestException } from '@nestjs/common';

import { parseBulkCsv } from '../bulk-csv.parser';

describe('Inventory — parseBulkCsv', () => {
  it('should parse a valid CSV with all columns', () => {
    const csv = [
      'sku_code,set_on_hand,low_stock_threshold,reason',
      'PRED-BLK-42,30,5,stock_take_2026Q2',
      'PRED-RED-43,12,3,recount',
    ].join('\n');

    const rows = parseBulkCsv(csv);

    expect(rows).toEqual([
      { sku_code: 'PRED-BLK-42', set_on_hand: 30, low_stock_threshold: 5, reason: 'stock_take_2026Q2' },
      { sku_code: 'PRED-RED-43', set_on_hand: 12, low_stock_threshold: 3, reason: 'recount' },
    ]);
  });

  it('should treat an omitted low_stock_threshold column as undefined', () => {
    const csv = ['sku_code,set_on_hand,reason', 'PRED-BLK-42,30,stock_take'].join('\n');

    const rows = parseBulkCsv(csv);

    expect(rows[0].low_stock_threshold).toBeUndefined();
  });

  it('should coerce a non-integer set_on_hand to NaN (reported per-row downstream)', () => {
    const csv = ['sku_code,set_on_hand,reason', 'PRED-BLK-42,abc,stock_take'].join('\n');

    const rows = parseBulkCsv(csv);

    expect(Number.isNaN(rows[0].set_on_hand)).toBe(true);
  });

  it('should respect quoted fields with embedded commas', () => {
    const csv = ['sku_code,set_on_hand,reason', 'PRED-BLK-42,30,"damaged, then recounted"'].join('\n');

    const rows = parseBulkCsv(csv);

    expect(rows[0].reason).toBe('damaged, then recounted');
  });

  it('should strip a UTF-8 BOM and handle CRLF line endings', () => {
    const csv = '﻿sku_code,set_on_hand,reason\r\nPRED-BLK-42,30,stock_take\r\n';

    const rows = parseBulkCsv(csv);

    expect(rows).toEqual([
      { sku_code: 'PRED-BLK-42', set_on_hand: 30, low_stock_threshold: undefined, reason: 'stock_take' },
    ]);
  });

  it('should skip blank trailing lines', () => {
    const csv = ['sku_code,set_on_hand,reason', 'PRED-BLK-42,30,stock_take', '', '  '].join('\n');

    expect(parseBulkCsv(csv)).toHaveLength(1);
  });

  it('should reject a CSV missing a required column with INVALID_CSV', () => {
    const csv = ['sku_code,reason', 'PRED-BLK-42,stock_take'].join('\n');

    expect(() => parseBulkCsv(csv)).toThrow(BadRequestException);
  });

  it('should reject an empty file with INVALID_CSV', () => {
    expect(() => parseBulkCsv('')).toThrow(BadRequestException);
  });
});
