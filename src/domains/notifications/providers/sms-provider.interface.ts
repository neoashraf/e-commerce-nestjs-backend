export interface SmsSendResult {
  messageRef: string;
  segments: number;
  encoding: 'gsm7' | 'unicode';
}

/** Thrown by an SMS provider. `permanent` failures are not retried (FR-NOTIF-043). */
export class SmsSendError extends Error {
  constructor(
    message: string,
    public readonly permanent: boolean,
    public readonly code = 'SMS_SEND_FAILED',
  ) {
    super(message);
  }
}

export interface ISmsProvider {
  /** Send via the non-masking (transactional) route. Throws SmsSendError on failure. */
  send(to: string, body: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('ISmsProvider');
