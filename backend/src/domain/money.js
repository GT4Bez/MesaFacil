// Regras de dinheiro compartilhadas pelos services (DECIMAL(10, 2) no banco).
export const MAX_PG_MONEY = 99999999.99;

export const roundMoney = (value) => Math.round(value * 100) / 100;

// Número finito arredondado a 2 casas; qualquer outra coisa vira null.
export const toMoney = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? roundMoney(value) : null;
