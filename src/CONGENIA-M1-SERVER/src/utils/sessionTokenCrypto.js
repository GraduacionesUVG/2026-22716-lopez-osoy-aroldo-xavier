'use strict';

const crypto = require('crypto');

function getKey() {
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('APP_ENCRYPTION_KEY must be 64 hex characters');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a raw Redis key for safe transmission to the frontend.
 * Layout: iv(12 bytes) || authTag(16 bytes) || ciphertext
 * Encoded as base64url.
 */
function encryptSessionKey(rawKey) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Decrypts an encrypted session token received via X-Session-Token header.
 * Returns the raw Redis key.
 * Throws if the token is malformed or tampered.
 */
function decryptSessionKey(encryptedToken) {
  const key = getKey();
  const buf = Buffer.from(encryptedToken, 'base64url');
  if (buf.length < 29) {
    throw new Error('Invalid session token: too short');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptSessionKey, decryptSessionKey };
