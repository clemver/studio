import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ReportRequest } from '../types';
import { saveBlob } from '../lib/download';
import type { ApiFailure } from './useCatalogue';
import { toFailure } from './useCatalogue';
import type { Status } from '../components/StatusIcon';

export interface JobLine { kind: Status; text: string }

/** Long job (style guide §6): POST starts it → poll every second → download; file name from the API. */
export function useReportJob(onDone?: (filename: string) => void) {
  const [job, setJob] = useState<JobLine | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const run = useCallback(async (req: ReportRequest) => {
    const what = req.format === 'pdf' ? 'PDF' : req.format === 'pptx' ? 'PowerPoint' : 'HTML';
    const call = `Report export (${what})`;
    setError(null);
    setJob({ kind: 'queued', text: `${what} report queued…` });
    try {
      const { jobId } = await api.startReport(req);
      for (;;) {
        await new Promise(r => setTimeout(r, 1000));
        if (!live.current) return;
        const j = await api.getJob(jobId);
        if (j.status === 'error') throw Object.assign(new Error(j.detail || 'The report could not be built.'), { call });
        if (j.status === 'done') break;
        setJob({ kind: 'queued', text: j.status === 'queued' ? `${what} report queued…` : `Building ${what} report… ${j.progress}%` });
      }
      const file = await api.downloadReport(jobId);
      if (!live.current) return;
      saveBlob(file.filename, file.blob);
      setJob({ kind: 'done', text: `${file.filename} downloaded` });
      onDone?.(file.filename);
    } catch (e) {
      if (!live.current) return;
      setJob({ kind: 'error', text: `${what} export failed` });
      setError(toFailure(e, call));
    }
  }, [onDone]);

  return { job, running: job?.kind === 'queued', error, clearError: () => setError(null), run };
}
