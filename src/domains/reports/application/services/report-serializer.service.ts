import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

import { ExportFormat } from '../../domain/export-enums';
import { ReportTable } from './report-content.service';

export interface SerializedReport {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Serialises a {@link ReportTable} to CSV (always available) or PDF (a generic printable table layout via
 * PDFKit — FR-RPT-070, §11 "csv always; pdf where a printable layout exists"). Output is derived purely
 * from the report's own columns/rows, so no secrets or unmodelled PII leak into an export (§14 security).
 */
@Injectable()
export class ReportSerializerService {
  serialize(table: ReportTable, format: ExportFormat): Promise<SerializedReport> | SerializedReport {
    return format === ExportFormat.PDF ? this.toPdf(table) : this.toCsv(table);
  }

  /** RFC-4180-style CSV: a header row + one row per record, with a UTF-8 BOM for Excel/Bangla. */
  private toCsv(table: ReportTable): SerializedReport {
    const header = table.columns.map((c) => this.csvCell(c)).join(',');
    const lines = table.rows.map((row) =>
      table.columns.map((c) => this.csvCell(this.cell(row[c]))).join(','),
    );
    const body = `﻿${[header, ...lines].join('\r\n')}\r\n`;
    return { buffer: Buffer.from(body, 'utf-8'), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  }

  private csvCell(value: string): string {
    if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  private cell(value: string | number | undefined): string {
    if (value === undefined || value === null) return '';
    return String(value);
  }

  /** A simple single-table PDF: title, "as of" stamp, header band, and one line per row. */
  private toPdf(table: ReportTable): Promise<SerializedReport> {
    return new Promise<SerializedReport>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () =>
        resolve({ buffer: Buffer.concat(chunks), contentType: 'application/pdf', extension: 'pdf' }),
      );
      doc.on('error', reject);

      const body = 'Helvetica';
      const bold = 'Helvetica-Bold';
      doc.font(bold).fontSize(16).fillColor('#111').text(table.title);
      doc.font(body).fontSize(9).fillColor('#666').text(`As of ${table.as_of}`);
      doc.moveDown(0.6);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const colWidth = Math.max(60, (right - left) / Math.max(table.columns.length, 1));

      const writeRow = (cells: string[], font: string) => {
        const y = doc.y;
        doc.font(font).fontSize(9).fillColor(font === bold ? '#111' : '#222');
        cells.forEach((cell, i) => {
          doc.text(cell, left + i * colWidth, y, { width: colWidth - 6, ellipsis: true });
        });
        doc.moveDown(0.3);
        doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#eee').stroke();
        doc.moveDown(0.2);
        if (doc.y > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
      };

      writeRow(table.columns, bold);
      for (const row of table.rows) {
        writeRow(
          table.columns.map((c) => this.cell(row[c])),
          body,
        );
      }
      doc.end();
    });
  }
}
