import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationChannel } from '../notification.enums';

/**
 * Identifies a promotional recipient across the channels we can reach them on. At least one
 * addressable field is present; `customerId` lets the real `AUTH` impl resolve stored preferences.
 */
export interface PromotionalRecipient {
  customerId?: string;
  phone?: string;
  email?: string;
}

/**
 * Outbound port to `AUTH` for promotional preferences (FR-NOTIF-051/054). NOTIF never stores
 * communication preferences — it reads opt-in here and delegates unsubscribe writes back here
 * (SRS §2, §13). Real impl = `AUTH` customer preferences; stubbed until that seam is wired.
 */
export interface IOptInReader {
  /** Whether the recipient has opted in to promotional messages on this channel (FR-NOTIF-051). */
  isOptedIn(channel: NotificationChannel, recipient: PromotionalRecipient): Promise<boolean>;

  /** Apply a promotional-email opt-out for the recipient (FR-NOTIF-054), keyed by email/customer id. */
  setEmailOptOut(recipient: PromotionalRecipient): Promise<void>;

  /** The promotional recipient set for "all opted-in" campaign sends (SRS §7.3, minimal path). */
  listOptedIn(channel: NotificationChannel): Promise<PromotionalRecipient[]>;
}

export const OPT_IN_READER = Symbol('IOptInReader');

/**
 * Stub `OptInReader`: everyone is opted-in by default so the eligible/send path is exercised, while
 * an in-memory opt-out set (seeded from `NOTIF_PROMO_OPTOUT_LIST` and grown by unsubscribe actions)
 * makes the suppressed/opted-out path observable. Replace by wiring the real `AUTH` preference seam.
 */
@Injectable()
export class StubOptInReader implements IOptInReader {
  private readonly logger = new Logger(StubOptInReader.name);
  /** Lower-cased email/phone addresses currently opted out of promotional messaging. */
  private readonly optedOut = new Set<string>();
  /** Seeded recipient set used for the "all opted-in" campaign source. */
  private readonly seededRecipients: PromotionalRecipient[];

  constructor(config: ConfigService) {
    const raw = config.get<string>('NOTIF_PROMO_OPTOUT_LIST') ?? '';
    for (const addr of raw.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)) {
      this.optedOut.add(addr);
    }
    const seed = config.get<string>('NOTIF_PROMO_SEED_RECIPIENTS') ?? '';
    this.seededRecipients = seed
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((addr) => (addr.includes('@') ? { email: addr } : { phone: addr }));
  }

  isOptedIn(_channel: NotificationChannel, recipient: PromotionalRecipient): Promise<boolean> {
    const addresses = [recipient.email, recipient.phone]
      .filter((a): a is string => !!a)
      .map((a) => a.toLowerCase());
    const optedIn = !addresses.some((a) => this.optedOut.has(a));
    return Promise.resolve(optedIn);
  }

  setEmailOptOut(recipient: PromotionalRecipient): Promise<void> {
    if (recipient.email) this.optedOut.add(recipient.email.toLowerCase());
    this.logger.log(`[stub] promotional-email opt-out applied for ${recipient.email ?? recipient.customerId ?? 'unknown'}`);
    return Promise.resolve();
  }

  listOptedIn(channel: NotificationChannel): Promise<PromotionalRecipient[]> {
    const eligible = this.seededRecipients.filter((r) => {
      const addr = (channel === NotificationChannel.EMAIL ? r.email : r.phone)?.toLowerCase();
      return addr ? !this.optedOut.has(addr) : false;
    });
    return Promise.resolve(eligible);
  }
}
