/* 36×20 toggle, grey off, blue on, label to the right. */
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button type="button" id={id} className="switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="tr" />
      {label}
    </button>
  );
}
