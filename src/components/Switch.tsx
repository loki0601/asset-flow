'use client';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
}

/**
 * Inline switch with an optional left label, used in compact contexts
 * (e.g. section headers). For full-row settings, use ToggleRow instead.
 */
export function Switch({ checked, onChange, label, ariaLabel }: Props) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      {label && (
        <span className="text-[10px] font-bold text-brand-sage uppercase tracking-tighter">
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-brand' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
