// Specs 017 e 018: dia escolhido num `input type="date"` (horário local do navegador) → instante com fuso.
export const startOfDay = (day) => new Date(`${day}T00:00:00`)

// O "Até" inclui o dia inteiro: o limite (exclusivo) é o início do dia seguinte.
export const dayAfter = (day) => {
  const date = startOfDay(day)
  date.setDate(date.getDate() + 1)
  return date
}

// Acrescenta `from`/`to` em ISO 8601 aos parâmetros quando os dias estão preenchidos.
export function setDayRange(params, { from, to }) {
  if (from) params.set('from', startOfDay(from).toISOString())
  if (to) params.set('to', dayAfter(to).toISOString())
}
