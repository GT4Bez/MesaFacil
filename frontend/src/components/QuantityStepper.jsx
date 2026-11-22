// Seletor de quantidade −/+ com alvos de toque de 44 px (spec 012).
export default function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false, label = 'Quantidade' }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Diminuir ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label={`Aumentar ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}
