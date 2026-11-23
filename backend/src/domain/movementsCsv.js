// Spec 018: CSV do histórico do insumo para Excel e LibreOffice em português
// (BOM, `;`, vírgula decimal, `\r\n`) e protegido contra injeção de fórmula.
const HEADER = [
  'id', 'data', 'tipo', 'quantidade', 'unidade', 'custo_unitario', 'saldo_depois',
  'quem_lancou', 'motivo', 'turno', 'pedido', 'mesa', 'item_vendido', 'qtd_vendida'
];
const TYPE_LABELS = { purchase: 'entrada', adjustment: 'ajuste', sale: 'venda' };
const FORMULA_START = /^[=+\-@\t\r\n]/;

const decimal = (value) => String(value).replace('.', ',');

// Texto livre: `'` na frente de quem começa como fórmula.
const text = (value) => {
  if (value === null || value === undefined) return '';
  const string = String(value);
  return FORMULA_START.test(string) ? `'${string}` : string;
};

// Campo com `;`, aspas ou quebra de linha vai entre aspas, com as aspas internas duplicadas.
const quote = (value) => (/[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

const cell = (value) => (value === null || value === undefined ? '' : String(value));

export function movementsToCsv(movements, unit) {
  const lines = movements.map((movement) =>
    [
      cell(movement.id),
      new Date(movement.createdAt).toISOString(),
      TYPE_LABELS[movement.type] ?? movement.type,
      decimal(movement.quantity),
      unit,
      decimal(movement.unitCost),
      decimal(movement.balanceAfter),
      text(movement.by),
      text(movement.reason),
      cell(movement.shiftId),
      cell(movement.sale?.orderId),
      cell(movement.sale?.tableNumber),
      text(movement.sale?.menuItem),
      cell(movement.sale?.itemQuantity)
    ].map(quote).join(';')
  );
  return `﻿${[HEADER.join(';'), ...lines].join('\r\n')}\r\n`;
}

// Nome em minúsculas, sem acento e com hífens; a data é a de hoje no servidor.
export function csvFilename(ingredientName, today = new Date()) {
  const slug = ingredientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'insumo';
  const pad = (number) => String(number).padStart(2, '0');
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return `historico-${slug}-${date}.csv`;
}
