// Validação e formatação de CNPJ.
// Suporta o CNPJ numérico tradicional e o CNPJ alfanumérico (Receita Federal, a partir de julho de 2026):
// 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos. O cálculo usa (código ASCII - 48) de cada caractere.

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove máscara e espaços, deixando só [0-9A-Z] em maiúsculas. */
export function cleanCnpj(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

function charValue(ch) {
  return ch.charCodeAt(0) - 48;
}

function checkDigit(base, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += charValue(base[i]) * weights[i];
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Retorna { valid, cnpj, reason } — cnpj vem limpo (14 caracteres) quando válido. */
export function validateCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (!cnpj) return { valid: false, cnpj, reason: 'Informe um CNPJ.' };
  if (cnpj.length !== 14) return { valid: false, cnpj, reason: 'O CNPJ precisa ter 14 caracteres.' };
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) {
    return { valid: false, cnpj, reason: 'Os dois últimos caracteres do CNPJ devem ser números.' };
  }
  if (/^(\d)\1{13}$/.test(cnpj)) return { valid: false, cnpj, reason: 'CNPJ inválido.' };
  const d1 = checkDigit(cnpj, WEIGHTS_1);
  const d2 = checkDigit(cnpj, WEIGHTS_2);
  if (d1 !== Number(cnpj[12]) || d2 !== Number(cnpj[13])) {
    return { valid: false, cnpj, reason: 'Dígitos verificadores não conferem. Confira o CNPJ digitado.' };
  }
  return { valid: true, cnpj, reason: null };
}

export function isValidCnpj(value) {
  return validateCnpj(value).valid;
}

export function isAlphanumericCnpj(value) {
  return /[A-Z]/.test(cleanCnpj(value));
}

/** 00.000.000/0000-00 */
export function formatCnpj(value) {
  const c = cleanCnpj(value);
  if (c.length !== 14) return String(value ?? '');
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/**
 * Extrai CNPJs de um texto livre: coluna colada do Excel, CSV ou lista separada por vírgula, ponto e vírgula ou linha.
 * Recupera zeros à esquerda que o Excel costuma apagar. Retorna { valid, invalid, duplicates }.
 */
export function extractCnpjs(text) {
  const cells = String(text ?? '').split(/[\n\r\t;,|"]+/);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  let duplicates = 0;
  for (const cell of cells) {
    const raw = cell.trim();
    if (!raw) continue;
    let c = cleanCnpj(raw);
    if (/^\d{11,13}$/.test(c)) c = c.padStart(14, '0');
    if (c.length !== 14) {
      // Células com outro conteúdo (nome, cidade, cabeçalho) são ignoradas; só conta como inválido o que parece CNPJ.
      if (/\d{8,}/.test(raw.replace(/\D/g, '')) && raw.replace(/\D/g, '').length >= 11) invalid.push(raw);
      continue;
    }
    if (!validateCnpj(c).valid) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(c)) {
      duplicates++;
      continue;
    }
    seen.add(c);
    valid.push(c);
  }
  return { valid, invalid, duplicates };
}

/** Máscara progressiva para inputs. */
export function maskCnpjInput(value) {
  const c = cleanCnpj(value).slice(0, 14);
  let out = c.slice(0, 2);
  if (c.length > 2) out += '.' + c.slice(2, 5);
  if (c.length > 5) out += '.' + c.slice(5, 8);
  if (c.length > 8) out += '/' + c.slice(8, 12);
  if (c.length > 12) out += '-' + c.slice(12, 14);
  return out;
}
