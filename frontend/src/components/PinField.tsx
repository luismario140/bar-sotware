interface Props {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  visible?: boolean
  disabled?: boolean
  describedBy?: string
}

export function PinField({ id, name, value, onChange, autoComplete, visible = false, disabled, describedBy }: Props) {
  return <div className="pin-field">
    <div className="pin-entry">
      <input id={id} name={name} type={visible ? 'text' : 'password'} inputMode="numeric"
        pattern="[0-9]{4}" minLength={4} maxLength={4}
        autoComplete={autoComplete} value={value} required disabled={disabled} aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} />
      <div className="pin-slots" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <span key={index} className={`pin-slot ${index === Math.min(value.length, 3) ? 'pin-slot-current' : ''} ${value[index] ? 'pin-slot-filled' : ''}`}>
          {value[index] ? visible ? value[index] : '●' : <span className="pin-slot-placeholder" />}
        </span>)}
      </div>
    </div>
  </div>
}
