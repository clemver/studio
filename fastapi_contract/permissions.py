"""Rights per user profile, read from config/permissions.json (the same file the UI uses in sample-data mode).

The server is the authority: GET /api/me returns the resolved permissions and limits, and every route that
changes something checks the permission it needs with `require(...)` (403 otherwise). The UI only hides what
the user may not do.

    from .permissions import require, resolve

    @router.put("/instruments/{id}/benchmark", dependencies=[require("benchmarks.security")])
    def set_security_benchmark(...): ...

Wire `current_user` to your authentication: it must return the user's profile id and roles.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, HTTPException

CONFIG = Path(__file__).resolve().parent.parent / "config" / "permissions.json"


@lru_cache
def config() -> dict:
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    known = set(data["permissions"])
    # Fail at start-up on a typo rather than silently denying.
    for kind in ("profiles", "roles"):
        for name, d in data[kind].items():
            unknown = [p for p in d["permissions"] if p not in known]
            if unknown:
                raise ValueError(f"{CONFIG.name}: {kind}.{name} uses unknown permissions {unknown}")
            parent = d.get("extends")
            if parent and parent not in data["profiles"]:
                raise ValueError(f"{CONFIG.name}: profiles.{name} extends unknown profile {parent!r}")
    return data


@dataclass
class Rights:
    profile: str
    roles: list[str]
    permissions: set[str] = field(default_factory=set)
    selection_limit: int = 6

    def can(self, permission: str) -> bool:
        return permission in self.permissions


def resolve(profile: str, roles: list[str] | None = None) -> Rights:
    """Profile (following `extends`) plus every role. Unknown profile → no rights."""
    cfg, roles = config(), list(roles or [])
    out = Rights(profile=profile, roles=roles)
    seen: set[str] = set()
    p: str | None = profile
    limit = None
    while p and p in cfg["profiles"] and p not in seen:
        seen.add(p)
        d = cfg["profiles"][p]
        out.permissions.update(d["permissions"])
        if limit is None and d.get("limits", {}).get("selection"):
            limit = d["limits"]["selection"]
        p = d.get("extends")
    for r in roles:
        out.permissions.update(cfg["roles"].get(r, {}).get("permissions", []))
    out.selection_limit = limit or 6
    return out


def current_user() -> Rights:
    """TODO: read the authenticated user and map it to a profile id and roles, e.g. from your identity provider."""
    raise NotImplementedError("Connect current_user() to authentication")


def require(*permissions: str):
    """Route dependency: the caller needs every listed permission."""
    unknown = [p for p in permissions if p not in config()["permissions"]]
    if unknown:
        raise ValueError(f"require(): unknown permissions {unknown}")

    def check(user: Rights = Depends(current_user)) -> Rights:
        missing = [p for p in permissions if not user.can(p)]
        if missing:
            text = config()["permissions"][missing[0]].lower()
            raise HTTPException(403, f"Your profile does not allow this ({text}).")
        return user

    return Depends(check)
