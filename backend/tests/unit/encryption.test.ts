import { encrypt, decrypt } from '../../src/shared/encryption.js';

describe('Encryption utility', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  test('encrypt then decrypt returns original text', () => {
    const plaintext = 'hello world secret';
    const ciphertext = encrypt(plaintext);
    const result = decrypt(ciphertext);
    expect(result).toBe(plaintext);
  });

  test("encrypt output contains ':' separator (iv:ciphertext)", () => {
    const ciphertext = encrypt('some text');
    expect(ciphertext).toContain(':');
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(2);
    // IV is 16 bytes = 32 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    // Ciphertext portion should be non-empty hex
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
  });

  test('Different ENCRYPTION_KEY cannot decrypt correctly', () => {
    const plaintext = 'sensitive data';
    const ciphertext = encrypt(plaintext);

    // Change the key to something different
    process.env.ENCRYPTION_KEY = 'wrong-key-totally-different-key!';

    // AES-CBC with wrong key either throws (bad padding) or returns garbled output
    let result;
    let threw = false;
    try {
      result = decrypt(ciphertext);
    } catch (e) {
      threw = true;
    }

    // Either it threw, or the result does not match the original plaintext
    expect(threw || result !== plaintext).toBe(true);
  });

  test('Empty string encrypt/decrypt roundtrip', () => {
    const plaintext = '';
    const ciphertext = encrypt(plaintext);
    const result = decrypt(ciphertext);
    expect(result).toBe(plaintext);
  });
});
