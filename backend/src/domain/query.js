import { DomainValidationError } from '../errors/AppError.js';

// Helpers de query string compartilhados pelas consultas paginadas (specs 016, 017 e 018).
const ID_PATTERN = /^[1-9]\d{0,17}$/;
const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseId(value, field) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new DomainValidationError(`${field} deve ser um id numérico.`);
  return value;
}

export function parseLimit(value, { fallback, max }) {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  if (!(parsed >= 1 && parsed <= max)) throw new DomainValidationError(`limit deve ser um inteiro de 1 a ${max}.`);
  return parsed;
}

// Data e hora ISO 8601 com fuso obrigatório: o backend não supõe o fuso de quem consulta.
function parseInstant(value, field) {
  const match = typeof value === 'string' ? ISO_WITH_OFFSET.exec(value) : null;
  if (match) {
    const [y, mo, d, h, mi, s] = match.slice(1, 7).map((part) => Number(part ?? 0));
    const calendar = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    const sameCalendar = calendar.getUTCFullYear() === y && calendar.getUTCMonth() === mo - 1
      && calendar.getUTCDate() === d && calendar.getUTCHours() === h && calendar.getUTCMinutes() === mi;
    const instant = new Date(value);
    if (sameCalendar && s < 60 && !Number.isNaN(instant.getTime())) return instant;
  }
  throw new DomainValidationError(`${field} deve ser data e hora ISO 8601 com fuso (ex.: 2026-11-23T00:00:00-03:00).`);
}

// `from` inclusivo e `to` exclusivo.
export function parseDateRange({ from, to }) {
  const range = {
    from: from === undefined ? null : parseInstant(from, 'from'),
    to: to === undefined ? null : parseInstant(to, 'to')
  };
  if (range.from && range.to && range.from >= range.to) throw new DomainValidationError('from deve ser anterior a to.');
  return range;
}
