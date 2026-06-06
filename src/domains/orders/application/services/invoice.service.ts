import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import PDFDocument = require('pdfkit');

import { OrderPaymentState } from '../../domain/order-enums';
import { INVOICE_HTML_TEMPLATE } from '../../infrastructure/invoice/invoice-template';
import { OrderReadAggregate } from './order-tracking.service';

export type InvoiceFormat = 'pdf' | 'html';

export interface RenderedInvoice {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** Resolved invoice view-model (all money as `0.00` strings) shared by the HTML + PDF renderers. */
interface InvoiceView {
  order_no: string;
  placed_at: string;
  seller_name: string;
  seller_address: string;
  seller_phone: string;
  seller_bin: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_address: string;
  buyer_bin: string | null;
  payment_method: string;
  payment_state: string;
  is_paid: boolean;
  coupon: string | null;
  items: Array<{
    index: number;
    title: string;
    sku: string;
    options: string;
    qty: number;
    unit_price: string;
    line_total: string;
  }>;
  amounts: {
    subtotal: string;
    discount: string;
    has_discount: boolean;
    delivery_charge: string;
    cod_surcharge: string;
    has_cod: boolean;
    vat_informational: string;
    grand_total: string;
  };
}

const FONT_FILE = 'NotoSansBengali-Regular.ttf';

/**
 * Renders the order invoice (FR-ORD-073) as HTML (Handlebars) or PDF (PDFKit) from the immutable order
 * snapshot. The **informational** VAT line is computed inclusively as `subtotal_after_discount × 15 ÷ 115`
 * (SRS §5.9 / §15) — ORD never recomputes tax, it only surfaces this challan line. Seller details + the VAT
 * **BIN** come from config (BIN defaults to the placeholder `000000000-0000` until the real BIN is set).
 * The layout is Mushak-6.3 compatible and an unpaid order renders its payment state, not a paid receipt
 * (§12.17). The PDF embeds the bundled Noto Sans Bengali TTF for true Bangla glyphs (falls back to the
 * standard font for Latin/numeric content if the asset is unavailable).
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly htmlTemplate: Handlebars.TemplateDelegate;
  private readonly bengaliFontPath: string | null;

  constructor(private readonly config: ConfigService) {
    this.htmlTemplate = Handlebars.compile(INVOICE_HTML_TEMPLATE);
    this.bengaliFontPath = this.resolveFontPath();
    if (!this.bengaliFontPath) {
      this.logger.warn(
        `Bengali invoice font (${FONT_FILE}) not found — PDF invoices fall back to the standard font for Bangla labels.`,
      );
    }
  }

  async render(aggregate: OrderReadAggregate, format: InvoiceFormat): Promise<RenderedInvoice> {
    const view = this.buildView(aggregate);
    if (format === 'html') {
      return {
        buffer: Buffer.from(this.htmlTemplate(view), 'utf-8'),
        contentType: 'text/html; charset=utf-8',
        filename: `invoice-${view.order_no}.html`,
      };
    }
    const pdf = await this.renderPdf(view);
    return { buffer: pdf, contentType: 'application/pdf', filename: `invoice-${view.order_no}.pdf` };
  }

  // ---------------------------------------------------------------------------
  // View model
  // ---------------------------------------------------------------------------

  private buildView({ order, items }: OrderReadAggregate): InvoiceView {
    const subtotalPaisa = this.toPaisa(order.subtotal);
    const discountPaisa = this.toPaisa(order.discountAmount);
    const codPaisa = this.toPaisa(order.codSurcharge);
    const afterDiscount = Math.max(subtotalPaisa - discountPaisa, 0);
    // Informational inclusive VAT: subtotal_after_discount × 15 ÷ 115 (FR-ORD-073, §15).
    const vatInformationalPaisa = Math.round((afterDiscount * 15) / 115);
    const isPaid =
      order.paymentState === OrderPaymentState.PAID ||
      order.paymentState === OrderPaymentState.COD_COLLECTED;

    return {
      order_no: order.orderNo,
      placed_at: this.formatDate(order.placedAt),
      seller_name: this.config.get<string>('SELLER_NAME', 'Sports E-Commerce Ltd.'),
      seller_address: this.config.get<string>('SELLER_ADDRESS', 'Dhaka, Bangladesh'),
      seller_phone: this.config.get<string>('SELLER_PHONE', '+8809600000000'),
      seller_bin: this.config.get<string>('SELLER_BIN', '000000000-0000'),
      buyer_name: order.addressSnapshot.recipient_name,
      buyer_phone: order.addressSnapshot.recipient_phone,
      buyer_address: this.formatAddress(order.addressSnapshot),
      buyer_bin: null,
      payment_method: order.paymentMethod.toUpperCase(),
      payment_state: this.humanState(order.paymentState),
      is_paid: isPaid,
      coupon: order.appliedCouponCode,
      items: items.map((it, i) => ({
        index: i + 1,
        title: it.productTitle,
        sku: it.skuCode,
        options: this.formatOptions(it.variantOptions),
        qty: it.quantity,
        unit_price: this.format(this.toPaisa(it.unitPrice)),
        line_total: this.format(this.toPaisa(it.lineTotal)),
      })),
      amounts: {
        subtotal: this.format(subtotalPaisa),
        discount: this.format(discountPaisa),
        has_discount: discountPaisa > 0,
        delivery_charge: this.format(this.toPaisa(order.deliveryCharge)),
        cod_surcharge: this.format(codPaisa),
        has_cod: codPaisa > 0,
        vat_informational: this.format(vatInformationalPaisa),
        grand_total: this.format(this.toPaisa(order.grandTotal)),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // PDF rendering (PDFKit)
  // ---------------------------------------------------------------------------

  private renderPdf(view: InvoiceView): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const body = 'Helvetica';
      const bold = 'Helvetica-Bold';
      if (this.bengaliFontPath) {
        // Registered as 'bn' for Bangla labels; Latin/numbers still use the standard font.
        doc.registerFont('bn', this.bengaliFontPath);
      }
      const bn = this.bengaliFontPath ? 'bn' : body;

      // Header
      doc.font(body).fontSize(9).fillColor('#555').text('Mushak-6.3', { align: 'right' });
      if (this.bengaliFontPath) doc.font(bn).fontSize(9).text('মূসক-৬.৩', { align: 'right' });
      doc.moveDown(0.3);
      doc.font(bold).fontSize(18).fillColor('#111').text(view.seller_name, { align: 'center' });
      doc.font(body).fontSize(10).fillColor('#555').text('Tax Invoice', { align: 'center' });
      doc.moveDown(1);

      // Parties
      const top = doc.y;
      doc.font(bold).fontSize(11).fillColor('#111').text('Seller', 48, top);
      doc.font(body).fontSize(10).fillColor('#222');
      doc.text(view.seller_name);
      doc.text(view.seller_address);
      doc.text(`Phone: ${view.seller_phone}`);
      doc.font(bold).text(`BIN: ${view.seller_bin}`);
      const sellerBottom = doc.y;

      doc.font(bold).fontSize(11).fillColor('#111').text('Buyer', 320, top);
      doc.font(body).fontSize(10).fillColor('#222');
      doc.text(view.buyer_name, 320);
      doc.text(view.buyer_phone, 320);
      doc.text(view.buyer_address, 320, undefined, { width: 220 });
      doc.y = Math.max(sellerBottom, doc.y) + 8;

      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.5);
      doc.font(body).fontSize(10).fillColor('#222');
      doc.text(`Invoice No: ${view.order_no}`, 48, doc.y, { continued: true });
      doc.text(`Date: ${view.placed_at}`, { align: 'right' });
      doc.moveDown(0.8);

      // Items table
      this.pdfTableRow(doc, bold, ['#', 'Description', 'SKU', 'Qty', 'Unit', 'Total'], true);
      doc.font(body);
      view.items.forEach((it) => {
        const desc = it.options ? `${it.title} (${it.options})` : it.title;
        this.pdfTableRow(doc, body, [
          String(it.index),
          desc,
          it.sku,
          String(it.qty),
          it.unit_price,
          it.line_total,
        ]);
      });
      doc.moveDown(1);

      // Totals
      const labelX = 300;
      const drawTotal = (label: string, value: string, strong = false) => {
        doc.font(strong ? bold : body).fontSize(strong ? 12 : 10).fillColor('#111');
        doc.text(label, labelX, doc.y, { width: 150, continued: true });
        doc.text(value, { align: 'right' });
      };
      drawTotal('Subtotal', view.amounts.subtotal);
      if (view.amounts.has_discount) {
        drawTotal(`Discount${view.coupon ? ` (${view.coupon})` : ''}`, `-${view.amounts.discount}`);
      }
      drawTotal('Delivery', view.amounts.delivery_charge);
      if (view.amounts.has_cod) drawTotal('COD Surcharge', view.amounts.cod_surcharge);
      drawTotal('VAT (15%, inclusive, informational)', view.amounts.vat_informational);
      doc.moveDown(0.2);
      drawTotal('Grand Total (BDT)', view.amounts.grand_total, true);
      doc.moveDown(1);

      // Payment
      doc.font(body).fontSize(10).fillColor('#222');
      doc.text(`Payment Method: ${view.payment_method}`, 48);
      doc.text(`Payment State: ${view.payment_state}`, 48);
      if (!view.is_paid) {
        doc.fillColor('#b45309').text('This invoice is not a paid receipt.', 48);
      }

      doc.end();
    });
  }

  private pdfTableRow(
    doc: PDFKit.PDFDocument,
    font: string,
    cells: [string, string, string, string, string, string],
    header = false,
  ): void {
    const xs = [48, 78, 300, 380, 430, 490];
    const widths = [28, 218, 78, 48, 58, 57];
    const y = doc.y;
    doc.font(font).fontSize(header ? 10 : 9).fillColor(header ? '#111' : '#222');
    cells.forEach((cell, i) => {
      const align = i >= 3 ? 'right' : 'left';
      doc.text(cell, xs[i], y, { width: widths[i], align });
    });
    doc.moveDown(0.4);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#eee').stroke();
    doc.moveDown(0.2);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveFontPath(): string | null {
    const candidates = [
      path.join(__dirname, '..', '..', 'infrastructure', 'invoice', 'assets', FONT_FILE),
      path.join(process.cwd(), 'src', 'domains', 'orders', 'infrastructure', 'invoice', 'assets', FONT_FILE),
      path.join(process.cwd(), 'dist', 'domains', 'orders', 'infrastructure', 'invoice', 'assets', FONT_FILE),
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }

  private toPaisa(decimal: string): number {
    return Math.round(parseFloat(decimal) * 100);
  }

  private format(paisa: number): string {
    return (paisa / 100).toFixed(2);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatOptions(options: Record<string, string> | null | undefined): string {
    if (!options) return '';
    return Object.entries(options)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }

  private formatAddress(a: {
    address_line: string;
    area?: string | null;
    district?: string | null;
    division?: string | null;
    postal_code?: string | null;
  }): string {
    return [a.address_line, a.area, a.district, a.division, a.postal_code]
      .filter((p): p is string => !!p)
      .join(', ');
  }

  private humanState(state: OrderPaymentState): string {
    return state.replace(/_/g, ' ').toUpperCase();
  }
}
