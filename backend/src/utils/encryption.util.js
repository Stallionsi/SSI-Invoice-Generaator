const crypto = require('crypto');
const { APP_ENCRYPTION_KEY } = require('../config/env');

/**
 * AES-256-GCM field-level encryption.
 *
 * Key must be a 64-character hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format: <iv_hex>:<ciphertext_hex>:<authTag_hex>
 */

const ALGORITHM = 'aes-256-gcm';
const KEY       = Buffer.from(APP_ENCRYPTION_KEY, 'hex');

if (KEY.length !== 32) {
  throw new Error('APP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} iv:ciphertext:authTag (all hex)
 */
const encrypt = (plaintext) => {
  if (!plaintext) return plaintext;
  const iv     = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
};

/**
 * Decrypt a ciphertext string produced by encrypt().
 * @param {string} ciphertext  iv:encrypted:tag
 * @returns {string} original plaintext
 */
const decrypt = (ciphertext) => {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  const [ivHex, encryptedHex, tagHex] = ciphertext.split(':');
  const iv        = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const tag       = Buffer.from(tagHex, 'hex');
  const decipher  = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
};

module.exports = { encrypt, decrypt };
