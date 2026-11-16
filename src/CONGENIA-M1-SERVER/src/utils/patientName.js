'use strict';

const crypto = require('crypto');

function getEncryptionKey() {
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('APP_ENCRYPTION_KEY must be 64 hex characters');
  return Buffer.from(hex, 'hex');
}

function encryptText(value) {
  const masterKey = getEncryptionKey();
  const dek = crypto.randomBytes(32);

  const textIv = crypto.randomBytes(12);
  const textCipher = crypto.createCipheriv('aes-256-gcm', dek, textIv);
  const textData = Buffer.concat([textCipher.update(value, 'utf8'), textCipher.final()]);
  const textTag = textCipher.getAuthTag();
  const textEnc = Buffer.concat([textIv, textTag, textData]);

  const dekIv = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv('aes-256-gcm', masterKey, dekIv);
  const dekData = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();
  const dekEnc = Buffer.concat([dekIv, dekTag, dekData]);

  return { textEnc, dekEnc };
}

function decryptText(textEnc, dekEnc) {
  const masterKey = getEncryptionKey();
  const dekIv = dekEnc.subarray(0, 12);
  const dekTag = dekEnc.subarray(12, 28);
  const dekData = dekEnc.subarray(28);
  const dekDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(dekData), dekDecipher.final()]);

  const textIv = textEnc.subarray(0, 12);
  const textTag = textEnc.subarray(12, 28);
  const textData = textEnc.subarray(28);
  const textDecipher = crypto.createDecipheriv('aes-256-gcm', dek, textIv);
  textDecipher.setAuthTag(textTag);
  return Buffer.concat([textDecipher.update(textData), textDecipher.final()]).toString('utf8');
}

function encryptPatientName(nombre) {
  const { textEnc: nombreEnc, dekEnc: nombreDekEnc } = encryptText(nombre);
  return { nombreEnc, nombreDekEnc };
}

function decryptPatientName(nombreEnc, nombreDekEnc) {
  return decryptText(nombreEnc, nombreDekEnc);
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

function tokenizePatientName(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return [...new Set(normalized.split(/\s+/).filter(Boolean))];
}

function getNameTokenKey() {
  const configured = process.env.PATIENT_NAME_TOKEN_HMAC_KEY || process.env.APP_ENCRYPTION_KEY;
  if (!configured || configured.length < 32) {
    throw new Error('PATIENT_NAME_TOKEN_HMAC_KEY or APP_ENCRYPTION_KEY is required for patient search tokens');
  }
  return configured;
}

function patientNameToken(value) {
  return crypto
    .createHmac('sha256', getNameTokenKey())
    .update(value)
    .digest();
}

function patientNameTokenHex(value) {
  return crypto
    .createHmac('sha256', getNameTokenKey())
    .update(value)
    .digest('hex');
}

module.exports = {
  decryptPatientName,
  decryptText,
  encryptPatientName,
  encryptText,
  normalizeSearchText,
  patientNameToken,
  patientNameTokenHex,
  tokenizePatientName,
};
