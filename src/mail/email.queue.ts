export const EMAIL_QUEUE = 'emails';

export const SEND_EMAIL_JOB = 'send';
export const SWEEP_EMAILS_JOB = 'sweep';

export interface SendEmailJobData {
  emailId: string;
}
