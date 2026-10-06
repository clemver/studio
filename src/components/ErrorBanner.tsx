import { StatusIcon } from './StatusIcon';

/** Dismissible red banner under the KPI strip, naming the call that failed and the API's detail. */
export function ErrorBanner({ error, onDismiss, onRetry }: { error: { call: string; detail: string } | null; onDismiss: () => void; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="banner" role="alert">
      <StatusIcon kind="error" message="Error" />
      <div>
        <b>{error.call} failed.</b> {error.detail}
        {onRetry && <> <button type="button" className="lnk" onClick={onRetry}>Retry</button></>}
      </div>
      <button type="button" className="x" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">×</button>
    </div>
  );
}
