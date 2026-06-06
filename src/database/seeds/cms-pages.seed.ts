import 'dotenv/config';
import { AppDataSource } from '../data-source';

/**
 * Idempotent seed for the default BD policy pages (FR-CMS-042; SRS 13 §15). Inserts the 8 editable,
 * delete-protected (`is_system`) pages: Privacy, Terms, Delivery, Exchange, Claim, About, Contact, FAQ.
 * Exchange/Claim copy reflects the resolved **exchange-only returns** model (no cash refund except
 * pre-dispatch cancellation of a prepaid order). Rerunning inserts nothing new (slug-keyed).
 * Run: `npm run seed:cms-pages`
 */
interface PageSeed {
  slug: string;
  title: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
}

const PAGES: PageSeed[] = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    body: '<p>We collect only the information needed to process your orders and improve your experience. We never sell your personal data. Contact us to review or delete your information.</p>',
    seoTitle: 'Privacy Policy | SportShop BD',
    seoDescription: 'How SportShop BD collects, uses, and protects your personal information.',
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    body: '<p>By using SportShop BD you agree to these terms. Prices are in BDT and include applicable VAT. We may update these terms from time to time.</p>',
    seoTitle: 'Terms & Conditions | SportShop BD',
    seoDescription: 'The terms governing your use of SportShop BD.',
  },
  {
    slug: 'delivery-information',
    title: 'Delivery Information',
    body: '<p>Delivery charges: Inside Dhaka ৳70, Near Dhaka ৳90, Outside Dhaka ৳120. Cash on Delivery outside Dhaka carries a 1% surcharge. Orders are dispatched within 1–3 working days.</p>',
    seoTitle: 'Delivery Information | SportShop BD',
    seoDescription: 'Delivery zones, charges, and timelines for SportShop BD.',
  },
  {
    slug: 'exchange-policy',
    title: 'Exchange Policy',
    body: '<p>Items may be exchanged within 30 days for an equal or higher value product; any price difference must be paid before the exchanged item is issued. We offer <strong>exchange or replacement only — no cash refund</strong>, except where a prepaid order is cancelled before dispatch. Returned items must be unused and in original packaging; our team checks resellability on receipt.</p>',
    seoTitle: 'Exchange Policy | SportShop BD',
    seoDescription: 'Our exchange-only returns policy: 30-day exchange, no cash refund.',
  },
  {
    slug: 'claim-policy',
    title: 'Claim Policy',
    body: '<p>For a defective or incorrect item, raise a claim with photos within 7 days of delivery. Approved claims are resolved by replacement or exchange (no cash refund). Defective returned goods are not restocked.</p>',
    seoTitle: 'Claim Policy | SportShop BD',
    seoDescription: 'How to raise a claim for a defective or incorrect item at SportShop BD.',
  },
  {
    slug: 'about-us',
    title: 'About Us',
    body: '<p>SportShop BD brings authentic football boots, jerseys, turf and futsal shoes, and accessories to athletes across Bangladesh.</p>',
    seoTitle: 'About Us | SportShop BD',
    seoDescription: 'Authentic sports gear for athletes across Bangladesh.',
  },
  {
    slug: 'contact',
    title: 'Contact',
    body: '<p>Reach our support team via the Get Help form or call us during business hours. We respond within one working day.</p>',
    seoTitle: 'Contact | SportShop BD',
    seoDescription: 'Get in touch with SportShop BD customer support.',
  },
  {
    slug: 'faq',
    title: 'FAQ',
    body: '<p>Find answers to common questions about ordering, delivery, payment, and our exchange-only returns policy.</p>',
    seoTitle: 'FAQ | SportShop BD',
    seoDescription: 'Frequently asked questions about shopping with SportShop BD.',
  },
];

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();
  for (const p of PAGES) {
    await ds.query(
      `INSERT INTO "cms_pages"
         ("id","slug","title","body","seo_title","seo_description","is_published","is_system")
       SELECT gen_random_uuid(),$1,$2,$3,$4,$5,true,true
       WHERE NOT EXISTS (SELECT 1 FROM "cms_pages" WHERE "slug"=$1)`,
      [p.slug, p.title, p.body, p.seoTitle, p.seoDescription],
    );
  }
  const count = await ds.query(`SELECT count(*)::int AS n FROM "cms_pages" WHERE "is_system"=true`);
  console.log(`Seed complete. cms_pages system rows: ${count[0].n}`);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
