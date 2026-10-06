/*
 * Rights per user profile, defined in config/permissions.json (shared with the FastAPI back end).
 * The server is the authority: GET /api/me returns the resolved permissions. `resolvePermissions` is the same rule,
 * used by the sample-data back end and as a fallback when an API version does not send them.
 */
import config from '../../config/permissions.json';

export type Permission = keyof typeof config.permissions;
export type Profile = keyof typeof config.profiles;
export type Role = keyof typeof config.roles;

interface ProfileDef { label: string; description: string; extends?: string; limits?: { selection?: number }; permissions: string[] }
interface RoleDef { label: string; description: string; permissions: string[] }

const PROFILES = config.profiles as Record<string, ProfileDef>;
const ROLES = config.roles as Record<string, RoleDef>;
export const PERMISSION_TEXT = config.permissions as Record<Permission, string>;
export const isPermission = (p: string): p is Permission => p in config.permissions;

export interface Rights { permissions: Permission[]; limits: { selection: number } }

/** Profile (following `extends`) plus every role; unknown names are ignored. */
export function resolvePermissions(profile: string, roles: string[] = []): Rights {
  const set = new Set<Permission>();
  let selection = 0;
  const seen = new Set<string>();
  for (let p: string | undefined = profile; p && PROFILES[p] && !seen.has(p); p = PROFILES[p].extends) {
    seen.add(p);
    PROFILES[p].permissions.forEach(x => { if (isPermission(x)) set.add(x); });
    if (!selection && PROFILES[p].limits?.selection) selection = PROFILES[p].limits!.selection!;
  }
  roles.forEach(r => ROLES[r]?.permissions.forEach(x => { if (isPermission(x)) set.add(x); }));
  return { permissions: [...set], limits: { selection: selection || 6 } };
}

export const profileLabel = (p: string) => PROFILES[p]?.label ?? p;
export const roleLabel = (r: string) => ROLES[r]?.label ?? r;
export const PROFILE_LIST = Object.entries(PROFILES).map(([id, d]) => ({ id: id as Profile, label: d.label, description: d.description }));
export const ROLE_LIST = Object.entries(ROLES).map(([id, d]) => ({ id: id as Role, label: d.label, description: d.description }));

// Typos in the file show up at once in development.
if (import.meta.env.DEV) {
  const bad = [...Object.entries(PROFILES).flatMap(([k, d]) => d.permissions.map(p => [k, p])), ...Object.entries(ROLES).flatMap(([k, d]) => d.permissions.map(p => [k, p]))]
    .filter(([, p]) => !isPermission(p));
  if (bad.length) console.error('config/permissions.json: unknown permissions', bad.map(([k, p]) => `${k}: ${p}`).join(', '));
}
