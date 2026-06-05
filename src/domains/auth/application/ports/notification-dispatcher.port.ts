export interface DispatchOtpCommand {
  phone: string;
  code: string;
  purpose: 'register' | 'login';
}

/**
 * Outbound port to the NOTIF module. AUTH only triggers delivery (FR-AUTH-021);
 * templates/delivery are owned by NOTIF. Implementations throw on delivery failure
 * so the caller can surface a 503 (AC2).
 */
export interface INotificationDispatcher {
  dispatchOtp(command: DispatchOtpCommand): Promise<void>;
}

export const NOTIFICATION_DISPATCHER = Symbol('INotificationDispatcher');
