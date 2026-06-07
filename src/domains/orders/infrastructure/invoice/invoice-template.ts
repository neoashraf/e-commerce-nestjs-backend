/**
 * Handlebars HTML template for the order invoice (FR-ORD-073). Bilingual (Bangla + English) labels and a
 * Mushak-6.3 (VAT challan) compatible layout: seller block incl. VAT BIN, buyer/delivery block, itemized
 * lines, an amount breakdown with an **informational** inclusive-15% VAT line, payment method/state, and
 * the order number/date. Bangla glyphs render via the Noto Sans Bengali web font (the PDF path embeds the
 * bundled TTF). An unpaid order shows its payment state — it is not a paid receipt (§12.17).
 *
 * The template body is escaped by Handlebars by default; all interpolated values are plain strings.
 */
export const INVOICE_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice {{order_no}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Noto Sans Bengali', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 13px; }
    .doc { max-width: 800px; margin: 0 auto; }
    .form-tag { text-align: right; font-size: 12px; color: #555; }
    .title { text-align: center; margin: 4px 0 2px; font-size: 20px; font-weight: 600; }
    .subtitle { text-align: center; margin: 0 0 16px; font-size: 12px; color: #555; }
    .parties { display: flex; justify-content: space-between; gap: 24px; border-top: 2px solid #111; border-bottom: 1px solid #ccc; padding: 12px 0; }
    .party { width: 50%; }
    .party h3 { margin: 0 0 6px; font-size: 13px; }
    .meta { display: flex; justify-content: space-between; padding: 10px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: left; }
    th { background: #f3f4f6; font-size: 12px; }
    td.num, th.num { text-align: right; }
    .totals { width: 320px; margin-left: auto; margin-top: 12px; }
    .totals td { border: none; padding: 4px 9px; }
    .totals .grand td { border-top: 2px solid #111; font-weight: 600; font-size: 15px; }
    .vat-note { font-size: 11px; color: #666; }
    .pay { margin-top: 18px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px; }
    .pay .state-unpaid { color: #b45309; font-weight: 600; }
    .pay .state-paid { color: #047857; font-weight: 600; }
    .foot { margin-top: 28px; text-align: center; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="form-tag">মূসক-৬.৩ / Mushak-6.3</div>
    <div class="title">{{seller_name}}</div>
    <div class="subtitle">কর চালানপত্র / Tax Invoice</div>

    <div class="parties">
      <div class="party">
        <h3>বিক্রেতা / Seller</h3>
        <div>{{seller_name}}</div>
        <div>{{seller_address}}</div>
        <div>ফোন / Phone: {{seller_phone}}</div>
        <div><strong>BIN: {{seller_bin}}</strong></div>
      </div>
      <div class="party">
        <h3>ক্রেতা / Buyer</h3>
        <div>{{buyer_name}}</div>
        <div>{{buyer_phone}}</div>
        <div>{{buyer_address}}</div>
        {{#if buyer_bin}}<div>BIN: {{buyer_bin}}</div>{{/if}}
      </div>
    </div>

    <div class="meta">
      <div>চালান নং / Invoice No: <strong>{{order_no}}</strong></div>
      <div>তারিখ / Date: <strong>{{placed_at}}</strong></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>পণ্যের বিবরণ / Description</th>
          <th>SKU</th>
          <th class="num">পরিমাণ / Qty</th>
          <th class="num">একক মূল্য / Unit</th>
          <th class="num">মোট / Total</th>
        </tr>
      </thead>
      <tbody>
        {{#each items}}
        <tr>
          <td>{{this.index}}</td>
          <td>{{this.title}}{{#if this.options}} <small>({{this.options}})</small>{{/if}}</td>
          <td>{{this.sku}}</td>
          <td class="num">{{this.qty}}</td>
          <td class="num">{{this.unit_price}}</td>
          <td class="num">{{this.line_total}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <table class="totals">
      <tr><td>উপমোট / Subtotal</td><td class="num">{{amounts.subtotal}}</td></tr>
      {{#if amounts.has_discount}}<tr><td>ছাড় / Discount{{#if coupon}} ({{coupon}}){{/if}}</td><td class="num">-{{amounts.discount}}</td></tr>{{/if}}
      <tr><td>ডেলিভারি চার্জ / Delivery</td><td class="num">{{amounts.delivery_charge}}</td></tr>
      {{#if amounts.has_cod}}<tr><td>সিওডি সারচার্জ / COD Surcharge</td><td class="num">{{amounts.cod_surcharge}}</td></tr>{{/if}}
      <tr><td>মূসক / VAT (15%, inclusive)<div class="vat-note">তথ্যমূলক / Informational — included in price</div></td><td class="num">{{amounts.vat_informational}}</td></tr>
      <tr class="grand"><td>সর্বমোট / Grand Total (BDT)</td><td class="num">{{amounts.grand_total}}</td></tr>
    </table>

    <div class="pay">
      <div>পেমেন্ট পদ্ধতি / Payment Method: <strong>{{payment_method}}</strong></div>
      <div>পেমেন্ট অবস্থা / Payment State:
        <span class="{{#if is_paid}}state-paid{{else}}state-unpaid{{/if}}">{{payment_state}}</span>
      </div>
      {{#unless is_paid}}<div class="vat-note">এই চালানটি একটি পরিশোধিত রসিদ নয় / This invoice is not a paid receipt.</div>{{/unless}}
    </div>

    <div class="foot">{{seller_name}} · BIN {{seller_bin}} · Generated for order {{order_no}}</div>
  </div>
</body>
</html>`;
