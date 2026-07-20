import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

import { AppDataSource } from '../data-source';

/**
 * Idempotent DEMO / sample-data seed — gives an admin a realistic dataset to explore the panel and
 * reports end-to-end: customers + addresses, a small catalog (products/variants/inventory), and a
 * spread of orders covering every payment + lifecycle scenario:
 *
 *   • COD — delivered & cash collected      (payment cod_collected)
 *   • Online (bKash) — paid & delivered     (payment paid, with a coupon discount)
 *   • Online (SSLCommerz) — full refund      (prepaid cancellation, refund completed)
 *   • Online (bKash) — pending payment       (unpaid / abandoned checkout)
 *   • COD — shipped & in transit             (payment cod_pending)
 *   • Online (SSLCommerz) — partial refund   (goodwill, second customer)
 *
 * Prerequisites (run first): migrations, then
 *   npm run seed:rbac && npm run seed:catalog-attributes && npm run seed:catalog-families
 *
 * Rerunning inserts nothing new (every row is guarded by its unique business key).
 * Run: `npm run seed:demo`
 *
 * NOTE: demo credentials below are for local/test data only — never seed these into production.
 */

const CUSTOMER_PASSWORD = 'Customer123!'; // demo storefront login password (all seeded customers)

const DELIVERY_CHARGE: Record<string, number> = {
  inside_dhaka: 60,
  near_dhaka: 100,
  outside_dhaka: 130,
};

// ---------------------------------------------------------------------------
// Catalog definitions
// ---------------------------------------------------------------------------

interface CategorySpec {
  key: string;
  name: string;
  slug: string;
}

const CATEGORIES: CategorySpec[] = [
  { key: 'boots', name: 'Football Boots', slug: 'football-boots' },
  { key: 'jerseys', name: 'Jerseys', slug: 'jerseys' },
  { key: 'turf', name: 'Turf & Futsal Shoes', slug: 'turf-futsal-shoes' },
  { key: 'accessories', name: 'Accessories', slug: 'accessories' },
];

interface VariantSpec {
  skuCode: string;
  options: Record<string, string>;
  onHand: number;
  lowStockThreshold: number;
}

interface ProductSpec {
  sku: string;
  name: string;
  slug: string;
  brand: string;
  shortDescription: string;
  description: string;
  basePrice: number;
  salePrice: number | null;
  familyCode: string;
  categoryKey: string;
  isFeatured: boolean;
  isNew: boolean;
  variants: VariantSpec[];
}

const PRODUCTS: ProductSpec[] = [
  {
    sku: 'DEMO-BOOT-001',
    name: 'Nike Phantom GX Elite FG',
    slug: 'nike-phantom-gx-elite-fg',
    brand: 'Nike',
    shortDescription: 'Firm-ground football boots with Gripknit upper for precise ball control.',
    description:
      'The Phantom GX Elite delivers a glove-like fit and grippy texture for sharp touches on firm natural grass. Built for attacking players who want maximum control.',
    basePrice: 18500,
    salePrice: 16500,
    familyCode: 'mens_footwear',
    categoryKey: 'boots',
    isFeatured: true,
    isNew: true,
    variants: [
      { skuCode: 'DEMO-BOOT-001-BLK-42', options: { Color: 'Black', Size: '42' }, onHand: 25, lowStockThreshold: 3 },
      { skuCode: 'DEMO-BOOT-001-BLK-43', options: { Color: 'Black', Size: '43' }, onHand: 12, lowStockThreshold: 3 },
      { skuCode: 'DEMO-BOOT-001-WHT-42', options: { Color: 'White', Size: '42' }, onHand: 0, lowStockThreshold: 3 },
    ],
  },
  {
    sku: 'DEMO-JRSY-001',
    name: 'Argentina Home Jersey 2024',
    slug: 'argentina-home-jersey-2024',
    brand: 'Adidas',
    shortDescription: 'Official-style Argentina home jersey, breathable AEROREADY fabric.',
    description:
      'Show your support with the iconic sky-blue and white stripes. Lightweight, moisture-wicking fabric keeps you cool on and off the pitch.',
    basePrice: 4500,
    salePrice: null,
    familyCode: 'apparel',
    categoryKey: 'jerseys',
    isFeatured: true,
    isNew: false,
    variants: [
      { skuCode: 'DEMO-JRSY-001-S', options: { Size: 'S' }, onHand: 2, lowStockThreshold: 3 },
      { skuCode: 'DEMO-JRSY-001-M', options: { Size: 'M' }, onHand: 40, lowStockThreshold: 5 },
      { skuCode: 'DEMO-JRSY-001-L', options: { Size: 'L' }, onHand: 30, lowStockThreshold: 5 },
    ],
  },
  {
    sku: 'DEMO-TURF-001',
    name: 'Adidas Predator TF Turf Shoes',
    slug: 'adidas-predator-tf-turf-shoes',
    brand: 'Adidas',
    shortDescription: 'Turf trainers with rubber studs for grip on artificial surfaces.',
    description:
      'Designed for the futsal court and turf pitch. Durable rubber outsole with multi-directional studs for fast cuts and stable footing.',
    basePrice: 9500,
    salePrice: 8900,
    familyCode: 'mens_footwear',
    categoryKey: 'turf',
    isFeatured: false,
    isNew: true,
    variants: [
      { skuCode: 'DEMO-TURF-001-41', options: { Size: '41' }, onHand: 18, lowStockThreshold: 3 },
      { skuCode: 'DEMO-TURF-001-42', options: { Size: '42' }, onHand: 22, lowStockThreshold: 3 },
      { skuCode: 'DEMO-TURF-001-43', options: { Size: '43' }, onHand: 9, lowStockThreshold: 3 },
    ],
  },
  {
    sku: 'DEMO-BALL-001',
    name: 'Adidas Al Rihla Football (Size 5)',
    slug: 'adidas-al-rihla-football-size-5',
    brand: 'Adidas',
    shortDescription: 'Match-quality size 5 football with thermally bonded seamless surface.',
    description:
      'Inspired by the official World Cup match ball. Seamless surface for accurate flight and reliable touch in all conditions.',
    basePrice: 3200,
    salePrice: null,
    familyCode: 'accessories',
    categoryKey: 'accessories',
    isFeatured: false,
    isNew: false,
    variants: [
      { skuCode: 'DEMO-BALL-001-OS', options: { Size: '5' }, onHand: 50, lowStockThreshold: 5 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

interface AddressSnapshot {
  recipient_name: string;
  recipient_phone: string;
  address_line: string;
  area: string;
  district: string;
  division: string;
  postal_code: string;
}

interface CustomerSpec {
  key: string;
  fullName: string;
  phone: string;
  email: string;
  address: AddressSnapshot & { deliveryZone: string };
}

const CUSTOMERS: CustomerSpec[] = [
  {
    key: 'rakib',
    fullName: 'Rakib Hasan',
    phone: '+8801711000001',
    email: 'rakib.demo@example.com',
    address: {
      recipient_name: 'Rakib Hasan',
      recipient_phone: '+8801711000001',
      address_line: 'House 12, Road 5, Dhanmondi',
      area: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
      postal_code: '1209',
      deliveryZone: 'inside_dhaka',
    },
  },
  {
    key: 'tania',
    fullName: 'Tania Akter',
    phone: '+8801711000002',
    email: 'tania.demo@example.com',
    address: {
      recipient_name: 'Tania Akter',
      recipient_phone: '+8801711000002',
      address_line: 'Flat B3, 27 Green Road, Tejgaon',
      area: 'Tejgaon',
      district: 'Dhaka',
      division: 'Dhaka',
      postal_code: '1215',
      deliveryZone: 'inside_dhaka',
    },
  },
];

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

interface OrderItemSpec {
  variantSku: string;
  productTitle: string;
  options: Record<string, string>;
  unitPrice: number;
  quantity: number;
}

interface HistoryStep {
  from: string | null;
  to: string;
  actor: 'customer' | 'admin' | 'system';
  daysAgo: number;
  note: string | null;
}

interface PaymentSpec {
  method: string; // cod | bkash | sslcommerz
  status: string; // PaymentStatus value
  internalRef: string;
  gatewayPaymentId: string | null;
  gatewayTxnId: string | null;
  collectedByAdmin: boolean; // COD: set collected_by_admin_id + collected_at
  collectedDaysAgo: number | null;
  paidDaysAgo: number | null;
  refundedAmount: number;
}

interface RefundSpec {
  amount: number;
  reason: string;
  type: string; // gateway | manual
  status: string; // pending | completed | failed
  gatewayRefundRef: string | null;
  requestedByAdmin: boolean;
  daysAgo: number;
}

interface OrderSpec {
  orderNo: string;
  customerKey: string;
  status: string; // OrderStatus value
  paymentMethod: string; // OrderPaymentMethod value
  paymentState: string; // OrderPaymentState value
  deliveryZone: string;
  placedDaysAgo: number;
  couponCode: string | null;
  discount: number;
  codSurcharge: number;
  items: OrderItemSpec[];
  history: HistoryStep[];
  payment: PaymentSpec;
  refund: RefundSpec | null;
}

const ORDERS: OrderSpec[] = [
  // 1) COD — delivered & cash collected
  {
    orderNo: 'SO-DEMO-001',
    customerKey: 'rakib',
    status: 'delivered',
    paymentMethod: 'cod',
    paymentState: 'cod_collected',
    deliveryZone: 'inside_dhaka',
    placedDaysAgo: 25,
    couponCode: null,
    discount: 0,
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-BOOT-001-BLK-42', productTitle: 'Nike Phantom GX Elite FG', options: { Color: 'Black', Size: '42' }, unitPrice: 16500, quantity: 1 },
    ],
    history: [
      { from: null, to: 'confirmed', actor: 'system', daysAgo: 25, note: 'COD order placed' },
      { from: 'confirmed', to: 'processing', actor: 'admin', daysAgo: 24, note: null },
      { from: 'processing', to: 'packed', actor: 'admin', daysAgo: 23, note: null },
      { from: 'packed', to: 'shipped', actor: 'admin', daysAgo: 22, note: 'Handed to courier' },
      { from: 'shipped', to: 'out_for_delivery', actor: 'admin', daysAgo: 21, note: null },
      { from: 'out_for_delivery', to: 'delivered', actor: 'admin', daysAgo: 20, note: 'Cash collected on delivery' },
    ],
    payment: {
      method: 'cod',
      status: 'cod_collected',
      internalRef: 'PAY-DEMO-001',
      gatewayPaymentId: null,
      gatewayTxnId: null,
      collectedByAdmin: true,
      collectedDaysAgo: 20,
      paidDaysAgo: 20,
      refundedAmount: 0,
    },
    refund: null,
  },
  // 2) bKash — paid & delivered (with coupon discount)
  {
    orderNo: 'SO-DEMO-002',
    customerKey: 'rakib',
    status: 'delivered',
    paymentMethod: 'bkash',
    paymentState: 'paid',
    deliveryZone: 'inside_dhaka',
    placedDaysAgo: 18,
    couponCode: 'WELCOME10',
    discount: 1220, // 10% of 12,200 subtotal
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-JRSY-001-M', productTitle: 'Argentina Home Jersey 2024', options: { Size: 'M' }, unitPrice: 4500, quantity: 2 },
      { variantSku: 'DEMO-BALL-001-OS', productTitle: 'Adidas Al Rihla Football (Size 5)', options: { Size: '5' }, unitPrice: 3200, quantity: 1 },
    ],
    history: [
      { from: null, to: 'pending_payment', actor: 'customer', daysAgo: 18, note: 'Checkout started' },
      { from: 'pending_payment', to: 'confirmed', actor: 'system', daysAgo: 18, note: 'bKash payment confirmed' },
      { from: 'confirmed', to: 'processing', actor: 'admin', daysAgo: 17, note: null },
      { from: 'processing', to: 'packed', actor: 'admin', daysAgo: 16, note: null },
      { from: 'packed', to: 'shipped', actor: 'admin', daysAgo: 15, note: null },
      { from: 'shipped', to: 'out_for_delivery', actor: 'admin', daysAgo: 14, note: null },
      { from: 'out_for_delivery', to: 'delivered', actor: 'admin', daysAgo: 13, note: null },
    ],
    payment: {
      method: 'bkash',
      status: 'paid',
      internalRef: 'PAY-DEMO-002',
      gatewayPaymentId: 'TR0011ABC2024',
      gatewayTxnId: 'BKH8842291X',
      collectedByAdmin: false,
      collectedDaysAgo: null,
      paidDaysAgo: 18,
      refundedAmount: 0,
    },
    refund: null,
  },
  // 3) SSLCommerz — prepaid cancellation, full refund
  {
    orderNo: 'SO-DEMO-003',
    customerKey: 'rakib',
    status: 'refunded',
    paymentMethod: 'sslcommerz',
    paymentState: 'refunded',
    deliveryZone: 'near_dhaka',
    placedDaysAgo: 14,
    couponCode: null,
    discount: 0,
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-TURF-001-42', productTitle: 'Adidas Predator TF Turf Shoes', options: { Size: '42' }, unitPrice: 8900, quantity: 1 },
    ],
    history: [
      { from: null, to: 'pending_payment', actor: 'customer', daysAgo: 14, note: 'Checkout started' },
      { from: 'pending_payment', to: 'confirmed', actor: 'system', daysAgo: 14, note: 'SSLCommerz payment confirmed' },
      { from: 'confirmed', to: 'cancelled', actor: 'customer', daysAgo: 12, note: 'Customer requested cancellation' },
      { from: 'cancelled', to: 'refunded', actor: 'admin', daysAgo: 12, note: 'Full refund issued to gateway' },
    ],
    payment: {
      method: 'sslcommerz',
      status: 'refunded',
      internalRef: 'PAY-DEMO-003',
      gatewayPaymentId: 'SSLZ2024TXN773',
      gatewayTxnId: 'VAL773SSLZ',
      collectedByAdmin: false,
      collectedDaysAgo: null,
      paidDaysAgo: 14,
      refundedAmount: 9000,
    },
    refund: {
      amount: 9000,
      reason: 'Prepaid order cancelled by customer',
      type: 'gateway',
      status: 'completed',
      gatewayRefundRef: 'RFND-SSLZ-0003',
      requestedByAdmin: true,
      daysAgo: 12,
    },
  },
  // 4) bKash — pending payment (unpaid / abandoned)
  {
    orderNo: 'SO-DEMO-004',
    customerKey: 'rakib',
    status: 'pending_payment',
    paymentMethod: 'bkash',
    paymentState: 'unpaid',
    deliveryZone: 'inside_dhaka',
    placedDaysAgo: 1,
    couponCode: null,
    discount: 0,
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-BOOT-001-BLK-43', productTitle: 'Nike Phantom GX Elite FG', options: { Color: 'Black', Size: '43' }, unitPrice: 16500, quantity: 1 },
    ],
    history: [
      { from: null, to: 'pending_payment', actor: 'customer', daysAgo: 1, note: 'Awaiting bKash payment' },
    ],
    payment: {
      method: 'bkash',
      status: 'initiated',
      internalRef: 'PAY-DEMO-004',
      gatewayPaymentId: 'TR0044PEND2024',
      gatewayTxnId: null,
      collectedByAdmin: false,
      collectedDaysAgo: null,
      paidDaysAgo: null,
      refundedAmount: 0,
    },
    refund: null,
  },
  // 5) COD — shipped & in transit (cash not yet collected)
  {
    orderNo: 'SO-DEMO-005',
    customerKey: 'rakib',
    status: 'shipped',
    paymentMethod: 'cod',
    paymentState: 'cod_pending',
    deliveryZone: 'outside_dhaka',
    placedDaysAgo: 4,
    couponCode: null,
    discount: 0,
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-TURF-001-41', productTitle: 'Adidas Predator TF Turf Shoes', options: { Size: '41' }, unitPrice: 8900, quantity: 1 },
      { variantSku: 'DEMO-JRSY-001-L', productTitle: 'Argentina Home Jersey 2024', options: { Size: 'L' }, unitPrice: 4500, quantity: 1 },
    ],
    history: [
      { from: null, to: 'confirmed', actor: 'system', daysAgo: 4, note: 'COD order placed' },
      { from: 'confirmed', to: 'processing', actor: 'admin', daysAgo: 3, note: null },
      { from: 'processing', to: 'packed', actor: 'admin', daysAgo: 3, note: null },
      { from: 'packed', to: 'shipped', actor: 'admin', daysAgo: 2, note: 'In transit via courier' },
    ],
    payment: {
      method: 'cod',
      status: 'cod_pending',
      internalRef: 'PAY-DEMO-005',
      gatewayPaymentId: null,
      gatewayTxnId: null,
      collectedByAdmin: false,
      collectedDaysAgo: null,
      paidDaysAgo: null,
      refundedAmount: 0,
    },
    refund: null,
  },
  // 6) SSLCommerz — delivered, then partial (goodwill) refund — second customer
  {
    orderNo: 'SO-DEMO-006',
    customerKey: 'tania',
    status: 'delivered',
    paymentMethod: 'sslcommerz',
    paymentState: 'partially_refunded',
    deliveryZone: 'inside_dhaka',
    placedDaysAgo: 10,
    couponCode: null,
    discount: 0,
    codSurcharge: 0,
    items: [
      { variantSku: 'DEMO-BOOT-001-WHT-42', productTitle: 'Nike Phantom GX Elite FG', options: { Color: 'White', Size: '42' }, unitPrice: 16500, quantity: 1 },
    ],
    history: [
      { from: null, to: 'pending_payment', actor: 'customer', daysAgo: 10, note: 'Checkout started' },
      { from: 'pending_payment', to: 'confirmed', actor: 'system', daysAgo: 10, note: 'SSLCommerz payment confirmed' },
      { from: 'confirmed', to: 'processing', actor: 'admin', daysAgo: 9, note: null },
      { from: 'processing', to: 'packed', actor: 'admin', daysAgo: 8, note: null },
      { from: 'packed', to: 'shipped', actor: 'admin', daysAgo: 7, note: null },
      { from: 'shipped', to: 'delivered', actor: 'admin', daysAgo: 5, note: null },
    ],
    payment: {
      method: 'sslcommerz',
      status: 'partially_refunded',
      internalRef: 'PAY-DEMO-006',
      gatewayPaymentId: 'SSLZ2024TXN906',
      gatewayTxnId: 'VAL906SSLZ',
      collectedByAdmin: false,
      collectedDaysAgo: null,
      paidDaysAgo: 10,
      refundedAmount: 1560,
    },
    refund: {
      amount: 1560,
      reason: 'Goodwill partial refund (minor packaging damage)',
      type: 'gateway',
      status: 'completed',
      gatewayRefundRef: 'RFND-SSLZ-0006',
      requestedByAdmin: true,
      daysAgo: 4,
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `NOW() - N days` SQL fragment for historical timestamps (N is a trusted integer literal). */
function daysAgoSql(days: number): string {
  return `NOW() - make_interval(days => ${Math.trunc(days)})`;
}

async function getBootstrapAdminId(ds: DataSource): Promise<string | null> {
  const rows = await ds.query(
    `SELECT "id" FROM "admin_users" WHERE "deleted_at" IS NULL ORDER BY "created_at" ASC LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

async function getFamilyIds(ds: DataSource): Promise<Map<string, string>> {
  const codes = [...new Set(PRODUCTS.map((p) => p.familyCode))];
  const rows: Array<{ id: string; code: string }> = await ds.query(
    `SELECT "id","code" FROM "attribute_families" WHERE "code" = ANY($1)`,
    [codes],
  );
  const map = new Map(rows.map((r) => [r.code, r.id]));
  for (const code of codes) {
    if (!map.has(code)) {
      throw new Error(
        `Missing attribute family "${code}". Run: npm run seed:catalog-attributes && npm run seed:catalog-families`,
      );
    }
  }
  return map;
}

async function ensureCategories(ds: DataSource): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    let rows = await ds.query(`SELECT "id" FROM "categories" WHERE "slug" = $1`, [c.slug]);
    if (rows.length === 0) {
      rows = await ds.query(
        `INSERT INTO "categories" ("id","name","slug","level","position","is_published","show_in_menu")
         VALUES (gen_random_uuid(),$1,$2,1,$3,true,true) RETURNING "id"`,
        [c.name, c.slug, i],
      );
    }
    map.set(c.key, rows[0].id);
  }
  return map;
}

async function ensureCatalog(
  ds: DataSource,
  familyIds: Map<string, string>,
  categoryIds: Map<string, string>,
): Promise<void> {
  for (const p of PRODUCTS) {
    let rows = await ds.query(`SELECT "id" FROM "products" WHERE "sku" = $1`, [p.sku]);
    let productId: string;
    if (rows.length === 0) {
      rows = await ds.query(
        `INSERT INTO "products"
           ("id","type","family_id","sku","name","slug","brand","short_description","description",
            "base_price","sale_price","status","is_featured","is_new","primary_category_id")
         VALUES (gen_random_uuid(),'simple',$1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10,$11,$12)
         RETURNING "id"`,
        [
          familyIds.get(p.familyCode),
          p.sku,
          p.name,
          p.slug,
          p.brand,
          p.shortDescription,
          p.description,
          p.basePrice,
          p.salePrice,
          p.isFeatured,
          p.isNew,
          categoryIds.get(p.categoryKey),
        ],
      );
    }
    productId = rows[0].id;

    for (const v of p.variants) {
      let vRows = await ds.query(`SELECT "id" FROM "product_variants" WHERE "sku_code" = $1`, [v.skuCode]);
      if (vRows.length === 0) {
        vRows = await ds.query(
          `INSERT INTO "product_variants" ("id","product_id","sku_code","price_override","is_enabled")
           VALUES (gen_random_uuid(),$1,$2,NULL,true) RETURNING "id"`,
          [productId, v.skuCode],
        );
      }
      const variantId: string = vRows[0].id;

      // Inventory (idempotent on the unique variant_id).
      await ds.query(
        `INSERT INTO "inventory"
           ("id","variant_id","product_id","on_hand","reserved","available","low_stock_threshold")
         VALUES (gen_random_uuid(),$1,$2,$3,0,$3,$4)
         ON CONFLICT ("variant_id") DO NOTHING`,
        [variantId, productId, v.onHand, v.lowStockThreshold],
      );
    }
  }
}

async function ensureCustomers(ds: DataSource): Promise<Map<string, string>> {
  const passwordHash = await bcrypt.hash(CUSTOMER_PASSWORD, 12);
  const map = new Map<string, string>();

  for (const c of CUSTOMERS) {
    let rows = await ds.query(`SELECT "id" FROM "customers" WHERE "phone" = $1`, [c.phone]);
    if (rows.length === 0) {
      rows = await ds.query(
        `INSERT INTO "customers"
           ("id","full_name","phone","email","password_hash",
            "phone_verified","email_verified","status","promo_sms_opt_in","promo_email_opt_in")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,true,true,'active',true,true)
         RETURNING "id"`,
        [c.fullName, c.phone, c.email, passwordHash],
      );
    }
    const customerId: string = rows[0].id;
    map.set(c.key, customerId);

    const addr = c.address;
    const existingAddr = await ds.query(
      `SELECT "id" FROM "addresses" WHERE "customer_id" = $1 AND "deleted_at" IS NULL LIMIT 1`,
      [customerId],
    );
    if (existingAddr.length === 0) {
      await ds.query(
        `INSERT INTO "addresses"
           ("id","customer_id","recipient_name","recipient_phone","address_line","area",
            "district","division","postal_code","delivery_zone","is_default")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
        [
          customerId,
          addr.recipient_name,
          addr.recipient_phone,
          addr.address_line,
          addr.area,
          addr.district,
          addr.division,
          addr.postal_code,
          addr.deliveryZone,
        ],
      );
    }
  }
  return map;
}

async function ensureOrders(
  ds: DataSource,
  customerIds: Map<string, string>,
  adminId: string | null,
): Promise<void> {
  for (const o of ORDERS) {
    const existing = await ds.query(`SELECT "id" FROM "orders" WHERE "order_no" = $1`, [o.orderNo]);
    if (existing.length > 0) continue; // already seeded — skip the whole order

    const customerId = customerIds.get(o.customerKey);
    if (!customerId) throw new Error(`Unknown customer key "${o.customerKey}" for ${o.orderNo}`);

    const customer = CUSTOMERS.find((c) => c.key === o.customerKey)!;
    const snapshot = {
      recipient_name: customer.address.recipient_name,
      recipient_phone: customer.address.recipient_phone,
      address_line: customer.address.address_line,
      area: customer.address.area,
      district: customer.address.district,
      division: customer.address.division,
      postal_code: customer.address.postal_code,
    };

    const subtotal = o.items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const deliveryCharge = DELIVERY_CHARGE[o.deliveryZone] ?? 0;
    const grandTotal = subtotal - o.discount + deliveryCharge + o.codSurcharge;

    await ds.transaction(async (m) => {
      // --- order ---
      const orderRows = await m.query(
        `INSERT INTO "orders"
           ("id","order_no","customer_id","status","payment_method","payment_state","delivery_zone",
            "address_snapshot","subtotal","discount_amount","applied_coupon_code","delivery_charge",
            "cod_surcharge","vat_amount","grand_total","placed_at","created_at","updated_at")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,0,$13,
                 ${daysAgoSql(o.placedDaysAgo)},${daysAgoSql(o.placedDaysAgo)},${daysAgoSql(o.placedDaysAgo)})
         RETURNING "id"`,
        [
          o.orderNo,
          customerId,
          o.status,
          o.paymentMethod,
          o.paymentState,
          o.deliveryZone,
          JSON.stringify(snapshot),
          subtotal,
          o.discount,
          o.couponCode,
          deliveryCharge,
          o.codSurcharge,
          grandTotal,
        ],
      );
      const orderId: string = orderRows[0].id;

      // --- order items (resolve real product/variant ids by sku) ---
      for (const it of o.items) {
        const vRows = await m.query(
          `SELECT "id","product_id" FROM "product_variants" WHERE "sku_code" = $1`,
          [it.variantSku],
        );
        if (vRows.length === 0) {
          throw new Error(`Order ${o.orderNo} references unknown variant "${it.variantSku}"`);
        }
        const lineTotal = it.unitPrice * it.quantity;
        await m.query(
          `INSERT INTO "order_items"
             ("id","order_id","product_id","variant_id","product_title","sku_code",
              "variant_options","unit_price","quantity","line_total")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
          [
            orderId,
            vRows[0].product_id,
            vRows[0].id,
            it.productTitle,
            it.variantSku,
            JSON.stringify(it.options),
            it.unitPrice,
            it.quantity,
            lineTotal,
          ],
        );
      }

      // --- status history ---
      for (const h of o.history) {
        const actorId = h.actor === 'admin' ? adminId : h.actor === 'customer' ? customerId : null;
        await m.query(
          `INSERT INTO "order_status_history"
             ("id","order_id","from_status","to_status","actor_type","actor_id","note","created_at")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,${daysAgoSql(h.daysAgo)})`,
          [orderId, h.from, h.to, h.actor, actorId, h.note],
        );
      }

      // --- payment ---
      const p = o.payment;
      const collectedAtSql = p.collectedDaysAgo !== null ? daysAgoSql(p.collectedDaysAgo) : 'NULL';
      const paidAtSql = p.paidDaysAgo !== null ? daysAgoSql(p.paidDaysAgo) : 'NULL';
      const paymentRows = await m.query(
        `INSERT INTO "payments"
           ("id","order_id","purpose","method","amount","currency","status","internal_ref",
            "gateway_payment_id","gateway_txn_id","collected_by_admin_id","collected_at",
            "refunded_amount","paid_at","created_at","updated_at")
         VALUES (gen_random_uuid(),$1,'order',$2,$3,'BDT',$4,$5,$6,$7,$8,${collectedAtSql},
                 $9,${paidAtSql},${daysAgoSql(o.placedDaysAgo)},${daysAgoSql(o.placedDaysAgo)})
         RETURNING "id"`,
        [
          orderId,
          p.method,
          grandTotal,
          p.status,
          p.internalRef,
          p.gatewayPaymentId,
          p.gatewayTxnId,
          p.collectedByAdmin ? adminId : null,
          p.refundedAmount,
        ],
      );
      const paymentId: string = paymentRows[0].id;

      // --- refund (optional) ---
      if (o.refund) {
        const r = o.refund;
        await m.query(
          `INSERT INTO "refunds"
             ("id","payment_id","amount","reason","type","gateway_refund_ref","status",
              "requested_by_admin_id","created_at","updated_at")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,${daysAgoSql(r.daysAgo)},${daysAgoSql(r.daysAgo)})`,
          [
            paymentId,
            r.amount,
            r.reason,
            r.type,
            r.gatewayRefundRef,
            r.status,
            r.requestedByAdmin ? adminId : null,
          ],
        );
      }
    });
  }
}

async function printSummary(ds: DataSource): Promise<void> {
  const counts = await ds.query(
    `SELECT
       (SELECT count(*)::int FROM "customers" WHERE "email" LIKE '%@example.com') AS demo_customers,
       (SELECT count(*)::int FROM "products" WHERE "sku" LIKE 'DEMO-%') AS demo_products,
       (SELECT count(*)::int FROM "product_variants" WHERE "sku_code" LIKE 'DEMO-%') AS demo_variants,
       (SELECT count(*)::int FROM "orders" WHERE "order_no" LIKE 'SO-DEMO-%') AS demo_orders,
       (SELECT count(*)::int FROM "payments" WHERE "internal_ref" LIKE 'PAY-DEMO-%') AS demo_payments,
       (SELECT count(*)::int FROM "refunds" WHERE "gateway_refund_ref" LIKE 'RFND-%') AS demo_refunds`,
  );
  console.log('Demo seed complete:', counts[0]);
  console.log(`Demo customer login password (all): ${CUSTOMER_PASSWORD}`);
}

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();
  try {
    const adminId = await getBootstrapAdminId(ds);
    if (!adminId) {
      console.warn(
        'No admin user found — admin-actioned rows will have a null actor. Run `npm run seed:rbac` first for a complete dataset.',
      );
    }
    const familyIds = await getFamilyIds(ds);
    const categoryIds = await ensureCategories(ds);
    await ensureCatalog(ds, familyIds, categoryIds);
    const customerIds = await ensureCustomers(ds);
    await ensureOrders(ds, customerIds, adminId);
    await printSummary(ds);
  } finally {
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
