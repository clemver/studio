/* 64px sidebar: GX² mark, search, section icons; messages, notifications, help and settings pinned at the bottom. */
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icons';
import { Menu, usePopover } from './Menu';
import type { MenuItem } from './Menu';
import { StatusIcon } from './StatusIcon';
import type { Notification } from '../state/studio';
import type { Level } from '../types';
import { Logo } from './Logo';
import { PROFILE_LIST, ROLE_LIST, profileLabel, roleLabel } from '../lib/permissions';

export interface NavPage { path: string; label: string; icon: ReactNode }

interface Props {
  pages: NavPage[];
  level: Level;
  notifications: Notification[];
  unseen: number;
  onSeen: () => void;
  onSearch: () => void;
  /** Extra roles (e.g. admin). */
  roles: string[];
  /** Sample-data mode only: switch profile and roles (in production they come from the server). */
  onSwitchLevel?: (l: Level) => void;
  onToggleRole?: (role: string) => void;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function Sidebar({ pages, level, notifications, unseen, onSeen, onSearch, onSwitchLevel, roles, onToggleRole }: Props) {
  const pop = usePopover<'messages' | 'notifications' | 'help' | 'settings'>();

  const menus: Record<string, { head: string; width: number; items: MenuItem[] }> = {
    messages: { head: 'Messages', width: 260, items: [{ kind: 'note', text: 'No messages.' }] },
    notifications: {
      head: 'Notifications', width: 320,
      items: notifications.length
        ? notifications.slice(0, 8).map(n => ({ label: n.text, onSelect: () => {}, icon: <StatusIcon kind={n.kind} message={n.kind} />, hint: hhmm(n.time) }))
        : [{ kind: 'note', text: 'No notifications yet. Report exports and uploads appear here.' }],
    },
    help: {
      head: 'Help', width: 300,
      items: [
        { kind: 'note', text: 'Click a row to see it. Ctrl/⌘-click adds or removes rows, Shift-click selects a range.' },
        { kind: 'note', text: 'Use ⋮ or right-click on a row for actions.' },
        { kind: 'note', text: 'Esc closes menus. Arrow keys move inside a menu.' },
        { kind: 'note', text: 'Figures in grids are in %, net of fees.' },
      ],
    },
    settings: {
      head: 'Settings', width: 280,
      items: [
        { kind: 'note', text: `Profile: ${profileLabel(level)}${roles.map(r => ' · ' + roleLabel(r)).join('')}` },
        ...(onSwitchLevel
          ? ([
            { kind: 'sep' },
            { kind: 'note', text: 'Sample data: switch profile' },
            ...PROFILE_LIST.map(p => ({ label: p.label, check: level === p.id, hint: p.description, onSelect: () => onSwitchLevel(p.id) })),
            ...(onToggleRole ? ROLE_LIST.map(r => ({ label: r.label, check: roles.includes(r.id), hint: r.description, onSelect: () => onToggleRole(r.id) })) : []),
            { kind: 'note', text: 'Rights are defined in config/permissions.json.' },
          ] as MenuItem[])
          : [{ kind: 'note', text: 'Your rights come from your profile.' } as MenuItem]),
      ],
    },
  };

  const pinned: { key: keyof typeof menus; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'messages', label: 'Messages', icon: <Icon.messages /> },
    { key: 'notifications', label: 'Notifications', icon: <Icon.bell />, badge: unseen },
    { key: 'help', label: 'Help', icon: <Icon.help /> },
    { key: 'settings', label: 'Settings', icon: <Icon.settings /> },
  ];

  return (
    <nav className="side" aria-label="Main">
      <Logo />
      <button type="button" className="sbtn" aria-label="Search instruments" data-tip="Search instruments" onClick={onSearch}><Icon.search /></button>
      <span className="sep" />
      {pages.map(p => (
        <NavLink key={p.path} to={p.path} className="sbtn" aria-label={p.label} data-tip={p.label}>{p.icon}</NavLink>
      ))}
      <span className="sp" />
      {pinned.map(b => (
        <button key={b.key} type="button" className="sbtn" aria-label={b.label} data-tip={b.label} aria-haspopup="menu" aria-expanded="false"
          onClick={ev => { if (b.key === 'notifications') onSeen(); pop.show({ el: ev.currentTarget, align: 'side' }, b.key as never); }}>
          {b.icon}
          {!!b.badge && <span className="bdg">{b.badge}</span>}
        </button>
      ))}
      {pop.open && (
        <Menu anchor={pop.open.anchor} onClose={pop.close} width={menus[pop.open.data].width} head={<b>{menus[pop.open.data].head}</b>}
          items={menus[pop.open.data].items} />
      )}
    </nav>
  );
}
