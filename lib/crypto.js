// Proteção de tokens e sessões.
// - Webhooks e tokens do Bitrix24 são gravados criptografados (AES-256-GCM).
// - A chave vem da variável de ambiente APP_SECRET. Sem ela, uma chave aleatória é gerada
//   uma única vez em ./data/.app-secret (permissão 600). Nenhum segredo fica no código-fonte.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './db.js';

let cachedKey;

function masterKey() {
  if (cachedKey) return cachedKey;
  let secret = process.env.APP_SECRET;
  if (!secret) {
    const dir = dataDir();
    const file = path.join(dir, '.app-secret');
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) {
      secret = fs.readFileSync(file, 'utf8').trim();
    } else {
      secret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  if (secret.length < 16) throw new Error('APP_SECRET precisa ter pelo menos 16 caracteres.');
  cachedKey = crypto.createHash('sha256').update(secret).digest();
  return cachedKey;
}

function subKey(purpose) {
  return crypto.createHmac('sha256', masterKey()).update(purpose).digest();
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', subKey('encrypt'), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(token) {
  if (!token) return null;
  const [v, iv, tag, ct] = String(token).split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Dado criptografado inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', subKey('encrypt'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export function encryptJson(obj) {
  return encrypt(JSON.stringify(obj));
}

export function decryptJson(token) {
  const s = decrypt(token);
  return s ? JSON.parse(s) : null;
}

/** Assina um objeto para uso em cookie (base64url(json).hmac). */
export function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const mac = crypto.createHmac('sha256', subKey('session')).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const mac = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', subKey('session')).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return `scrypt.${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [alg, salt, hash] = String(stored).split('.');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function resetKeyForTests() {
  cachedKey = undefined;
}
