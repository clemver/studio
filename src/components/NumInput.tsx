import { useEffect, useState } from 'react';

/** Number field that lets people type freely ("12.", "") and reports parsed numbers. */
export function NumInput({ value, onChange, className = 'inp num', ...rest }: { value: number; onChange: (v: number) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(Number.isFinite(value) ? String(value) : ''); }, [value, focused]);
  return (
    <input {...rest} className={className} inputMode="decimal" value={text}
      onFocus={ev => { setFocused(true); ev.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      onChange={ev => { const t = ev.target.value.replace(',', '.'); setText(t); const n = Number(t); onChange(t.trim() === '' || !isFinite(n) ? NaN : n); }} />
  );
}
