/* Outline icons from the prototype. 16px icons use a 16 viewBox, page/sidebar icons a 24 viewBox. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const I16 = (d: React.ReactNode) => (p: P) => <svg viewBox="0 0 16 16" aria-hidden="true" {...p}>{d}</svg>;
const I24 = (d: React.ReactNode) => (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>{d}</svg>;

export const Icon = {
  chev: (p: P) => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true" {...p}><path d="M6 3.5l4.5 4.5L6 12.5" /></svg>,
  down: (p: P) => <svg viewBox="0 0 12 12" aria-hidden="true" {...p}><path d="M3 4.5l3 3 3-3" /></svg>,
  plus: I16(<path d="M8 3v10M3 8h10" />),
  minus: I16(<path d="M3 8h10" />),
  dots: (p: P) => <svg viewBox="0 0 16 16" style={{ fill: 'currentColor', stroke: 'none' }} aria-hidden="true" {...p}><circle cx="8" cy="3.5" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="12.5" r="1.4" /></svg>,
  reset: I16(<><path d="M3 8a5 5 0 1 0 1.6-3.7" /><path d="M3 2.5V5h2.5" /></>),
  trash: I16(<path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 9h5.8l.6-9" />),
  edit: I16(<path d="M3 13l1-3 7-7 2 2-7 7z" />),
  dup: I16(<><rect x="5" y="5" width="8" height="8" rx="1" /><path d="M3 10V3h7" /></>),
  copy: I16(<><rect x="5" y="5" width="8" height="9" rx="1" /><path d="M3 11V3a1 1 0 0 1 1-1h6" /></>),
  dash: I16(<><path d="M2 13h12" /><path d="M3 10l3-4 3 2 4-5" /></>),
  rep: I16(<><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3M6 9h4M6 11.5h4" /></>),
  fold16: I16(<path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />),
  search16: I16(<><circle cx="7" cy="7" r="4.5" /><path d="M14 14l-3.6-3.6" /></>),
  filter: I16(<><path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0" /><circle cx="10.5" cy="4" r="1.5" /><circle cx="5.5" cy="8" r="1.5" /><circle cx="12.5" cy="12" r="1.5" /></>),
  download: I16(<><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5" /><path d="M2.5 13.5h11" /></>),
  rows: I16(<><path d="M2 3.5h12M5 8h9M5 12.5h9" /><path d="M2 8h.01M2 12.5h.01" /></>),
  close: I16(<path d="M4 4l8 8M12 4l-8 8" />),
  left: I16(<path d="M10 3.5L5.5 8l4.5 4.5" />),
  right: I16(<path d="M6 3.5l4.5 4.5L6 12.5" />),
  arrow: I16(<path d="M3 8h10M9 4l4 4-4 4" />),
  folder: (p: P) => <svg viewBox="0 0 20 20" aria-hidden="true" {...p}><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.6 1.8H16.5a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>,
  homeSm: (p: P) => <svg viewBox="0 0 20 20" aria-hidden="true" {...p}><path d="M3.5 9.5L10 4l6.5 5.5" /><path d="M5 8.5v8h10v-8" /></svg>,
  // KPI / page icons (24)
  grid: I24(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10" /></>),
  check: I24(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  cal: I24(<><rect x="4" y="5.5" width="16" height="14" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  // sidebar
  search: I24(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  explorer: I24(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  dashboard: I24(<><path d="M4 19h16" /><path d="M5 15l4-5 4 3 6-7" /></>),
  reports: I24(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 13h5M10 17h5" /></>),
  custom: I24(<><path d="M3 18l5-6 4 3 4-6" /><path d="M18 3v6M15 6h6" /></>),
  upload: I24(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
  messages: I24(<><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></>),
  bell: I24(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  help: I24(<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5" /><path d="M12 17h.01" /></>),
  settings: I24(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z" /></>),
  home: I24(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>),
  burger: I24(<path d="M4 7h16M4 12h16M4 17h16" />),
};
