/* Outline status icons, 20px: done (teal), warning (yellow), error (red), queued (white). Message on hover. */
export type Status = 'done' | 'warn' | 'error' | 'queued';

const PATHS: Record<Status, React.ReactNode> = {
  done: <><circle cx="10" cy="10" r="7.5" /><path d="M6.8 10.3l2.2 2.2 4.2-4.6" /></>,
  warn: <><path d="M10 3l7.5 13.5h-15z" /><path d="M10 8v4M10 14.2v.1" /></>,
  error: <><path d="M10 2.5l7.5 7.5-7.5 7.5L2.5 10z" /><path d="M10 7v3.6M10 13v.1" /></>,
  queued: <circle cx="10" cy="10" r="7.5" strokeDasharray="3 2.6" />,
};

export function StatusIcon({ kind, message }: { kind: Status; message: string }) {
  return (
    <span className={`st ${kind}`} data-tip={message} aria-label={message} role="img">
      <svg viewBox="0 0 20 20">{PATHS[kind]}</svg>
    </span>
  );
}
