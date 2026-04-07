import { jest } from '@jest/globals';

// Mock nodemailer before importing email module
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
  },
}));

const { sendAlert } = await import('../../src/shared/email.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendAlert', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns false when SMTP_HOST not configured', async () => {
    delete process.env.SMTP_HOST;
    const result = await sendAlert('admin@test.com', 'Test', '<p>Test</p>');
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('returns false when no recipients', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const result = await sendAlert('', 'Test', '<p>Test</p>');
    expect(result).toBe(false);
  });

  it('calls sendMail with correct params when configured', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'BK <noreply@test.com>';

    const result = await sendAlert('admin@test.com', 'Alert', '<p>Down</p>');
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'BK <noreply@test.com>',
      to: 'admin@test.com',
      subject: 'Alert',
      html: '<p>Down</p>',
    });
  });

  it('returns false and does not throw when sendMail fails', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const result = await sendAlert('admin@test.com', 'Alert', '<p>Down</p>');
    expect(result).toBe(false);
  });
});
