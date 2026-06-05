export interface EmailSendResult {
  messageRef: string;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly permanent: boolean,
    public readonly code = 'EMAIL_SEND_FAILED',
  ) {
    super(message);
  }
}

export interface IEmailProvider {
  send(to: string, subject: string, html: string): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = Symbol('IEmailProvider');
