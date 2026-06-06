import { BadRequestException } from '@nestjs/common';

import { BulkRow } from './bulk.service';

/** Required CSV columns for a bulk inventory import (mirrors the JSON `rows[]` shape). */
const REQUIRED_HEADERS = ['sku_code', 'set_on_hand', 'reason'] as const;
const OPTIONAL_HEADERS = ['low_stock_threshold'] as const;

/**
 * Parse a bulk-inventory CSV (UTF-8) into normalized {@link BulkRow}s. Header-validated (the first line
 * must contain `sku_code`, `set_on_hand`, `reason`; `low_stock_threshold` is optional); supports quoted
 * fields with embedded commas/quotes. Numeric fields are coerced loosely (a non-numeric value becomes
 * `NaN`, which `BulkService` reports as an invalid-quantity per-row error — parsing never silently
 * drops a data row). A structurally broken header is a `400 INVALID_CSV` (the whole upload is rejected
 * before any row is applied); per-row content problems are deferred to the service's per-row validation.
 */
export function parseBulkCsv(content: string): BulkRow[] {
  const text = content.replace(/^﻿/, ''); // strip a UTF-8 BOM if present
  const lines = splitCsvLines(text);
  if (lines.length === 0) {
    throw new BadRequestException({ code: 'INVALID_CSV', message: 'CSV file is empty.' });
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      throw new BadRequestException({
        code: 'INVALID_CSV',
        message: `CSV is missing the required "${required}" column.`,
      });
    }
  }
  const allowed = new Set<string>([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
  const index = (name: string): number => header.indexOf(name);

  const skuIdx = index('sku_code');
  const setIdx = index('set_on_hand');
  const reasonIdx = index('reason');
  const thresholdIdx = index('low_stock_threshold'); // -1 when absent

  const rows: BulkRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue; // skip blank trailing lines
    const cells = parseCsvLine(lines[i]);
    const skuCode = (cells[skuIdx] ?? '').trim();
    const setRaw = (cells[setIdx] ?? '').trim();
    const reason = (cells[reasonIdx] ?? '').trim();
    const thresholdRaw = thresholdIdx >= 0 ? (cells[thresholdIdx] ?? '').trim() : '';

    rows.push({
      sku_code: skuCode,
      set_on_hand: toIntOrNaN(setRaw),
      low_stock_threshold:
        thresholdIdx >= 0 && thresholdRaw !== '' ? toIntOrNaN(thresholdRaw) : undefined,
      reason,
    });
  }

  // `allowed` is read only to document the accepted header set; unknown extra columns are ignored.
  void allowed;
  return rows;
}

/** Coerce a CSV cell to an integer, or NaN for a non-integer (reported per-row downstream). */
function toIntOrNaN(value: string): number {
  if (value === '' || !/^-?\d+$/.test(value)) return Number.NaN;
  return Number.parseInt(value, 10);
}

/** Split raw CSV text into logical lines, respecting newlines inside quoted fields. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // a doubled quote inside a quoted field is an escaped quote, not a delimiter toggle
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      lines.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current !== '') lines.push(current);
  return lines;
}

/** Parse a single CSV line into cells, handling quoted fields and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
