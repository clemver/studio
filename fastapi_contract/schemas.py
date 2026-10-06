"""Pydantic models the Timeseries Studio UI expects (snake_case on the wire).

Units:
- Monthly returns are decimals (0.0123 = 1.23 %), one per month end.
- Dates are month-end ISO dates (2026-09-30).
- Custom-series weights are in percent (70 = 70 %) and must total 100 in each leg.
- Leg `fee` is an annual fee in percent (0.5 = 0.50 % p.a.), deducted monthly: r_net = (1 + r) / (1 + fee)^(1/12) - 1.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Level = str  # profile id from config/permissions.json ("standard", "advanced", …)
Category = Literal["investment_grid", "asset_allocation_fund", "model_portfolio", "fund", "custom_series", "uploaded"]  # fund: third-party funds from the universe
RiskProfile = Literal["Conservative", "Income", "Balanced", "Growth", "Equity"]
Source = Literal["api", "custom", "upload"]
Rebalancing = Literal["fixed", "drift", "monthly", "yearly"]  # see CustomSeriesIn
JobStatus = Literal["queued", "running", "done", "error"]
ReportTemplate = Literal["comparison", "factsheet"]
ReportFormat = Literal["pdf", "html", "pptx"]  # pdf / html: A4 pages; pptx: 16:9 slides with native tables and charts
ReportLanguage = Literal["en", "fr", "de"]


class Limits(BaseModel):
    selection: int  # instruments selectable at once in the Explorer


class Me(BaseModel):
    """Who the caller is and what they may do, resolved with permissions.resolve(profile, roles).
    The UI shows and hides features from `permissions`; every route still checks them (403)."""
    user: str
    level: Level  # the user's profile
    roles: list[str] = []  # extra roles, e.g. ["admin"]
    permissions: list[str]  # resolved from config/permissions.json
    limits: Limits


class Instrument(BaseModel):
    id: str
    code: str
    name: str  # source name
    alias: str = ""  # display name; empty = use `name`
    category: Category
    risk_profile: Optional[RiskProfile] = None
    currency: str
    inception: date  # first month end with a return
    benchmark_name: Optional[str] = None  # or a construction summary for custom / uploaded series
    source: Source = "api"
    carried_forward_months: Optional[int] = None  # uploads only
    tags: list[str] = []  # tag ids
    benchmark_id: Optional[str] = None  # security-level benchmark (admin, all users); see BENCHMARKS below


BENCHMARKS = """
Benchmarks are instruments (track records or custom series). Which one applies depends on the folder viewed:
  yellow folder F : F.benchmark_overrides[instrument] -> F.benchmark_id -> no-folder rule
  blue folder F   : instrument.benchmark_id -> F.benchmark_id -> parent folder's benchmark_id -> API default
  no folder       : instrument.benchmark_id -> API default (the composite returned by /returns)
The UI resolves this; the server stores the three levels and enforces who may set them:
  instrument.benchmark_id : admins (PUT /api/instruments/{id}/benchmark), shared by all users
  blue folder benchmark   : admins (PATCH /api/folders/{id})
  yellow folder benchmark + overrides : the owner only, never returned to other users
GET /api/instruments/{id} and /returns must also serve an instrument the caller cannot list when it is a
benchmark the caller can see (e.g. an admin's private custom series used for everyone).
A custom series used as a benchmark cannot be deleted (409 naming where it is used).
"""


class BenchmarkIn(BaseModel):
    benchmark_id: Optional[str] = None  # null resets to the folder / API default


class Tag(BaseModel):
    """Shared label to classify and filter securities. Not linked to folders.
    Admins tag any security (PUT /api/instruments/{id}/tags); users tag their own custom series."""
    id: str
    name: str


class TagsIn(BaseModel):
    tags: list[str]  # tag ids; replaces the security's tags


class TagIn(BaseModel):
    name: str  # returns the existing tag when the name already exists (case-insensitive)


Frequency = Literal["D", "W", "M"]  # daily (business days), weekly (Friday / last business day), monthly (month end)


class ReturnSeries(BaseModel):
    """GET /api/instruments/{id}/returns?frequency=M (default) | W | D &currency=CHF (optional, convert).
    Dates are period ends; daily returns must compound to the weekly and monthly ones."""
    dates: list[date]  # period ends, ascending
    returns: list[Optional[float]]  # decimals
    benchmark: Optional[list[Optional[float]]] = None


class RiskFreeSeries(BaseModel):
    """GET /api/risk-free?currency=CHF&frequency=D: short-rate returns per period (SARON, €STR, SOFR, SONIA…)."""
    dates: list[date]
    returns: list[float]


class AliasIn(BaseModel):
    alias: str = Field("", max_length=60)


class AliasOut(BaseModel):
    alias: str


FolderKind = Literal["system", "user", "custom"]  # custom: the user's own sub-folders of Custom series (custom series only)


class Folder(BaseModel):
    """kind "system" = the Watchlist (blue): a curated subset of the investable universe, shared by all users.
    Admins create, rename and delete Watchlist folders and fill them by hand, with track records only (422).
    The UI's default view is the whole Watchlist (every instrument in a Watchlist folder). Users may put any
    instrument of the universe, Watchlist or not, in their own folders.
    User folders (yellow) belong to one user (the brief's watchlists). Both hold explicit instrument lists;
    a parent (e.g. Model portfolios) also shows its sub-folders' instruments. Only instruments the caller
    may see are listed. Tags are independent of folders. One level of sub-folders (parent_id, same kind) for
    every kind. `custom` folders are private, shown under Custom series, and hold custom series only (422)."""
    id: str
    name: str
    kind: FolderKind
    parent_id: Optional[str] = None
    instrument_ids: list[str] = []
    editable: bool  # user folder, or system folder and the caller is admin
    benchmark_id: Optional[str] = None  # blue: admins, inherited by sub-folders; yellow: owner only
    benchmark_overrides: dict[str, str] = {}  # yellow folders only: instrument id -> benchmark id (owner only)


class FolderIn(BaseModel):
    name: str
    instrument_ids: list[str] = []
    kind: FolderKind = "user"  # "system" requires admin (403)
    parent_id: Optional[str] = None


class FolderPatch(BaseModel):
    name: Optional[str] = None
    instrument_ids: Optional[list[str]] = None  # on a system folder: admin only (403)
    benchmark_id: Optional[str] = None  # on a system folder: admin only (403); send null explicitly to reset
    benchmark_overrides: Optional[dict[str, str]] = None  # own yellow folders only (422 on a system folder)


class CustomComponent(BaseModel):
    id: str
    weight: float  # percent


class CustomLeg(BaseModel):
    start: date  # first month end included
    end: Optional[date] = None  # last month end included; null = ongoing (last leg only)
    fee: float = 0  # percent p.a.
    components: list[CustomComponent]


class CustomSeriesIn(BaseModel):
    """Legs follow each other month by month (leg n+1 starts the month after leg n ends).
    Every component must have returns for the whole leg. Within a leg:
      fixed    weights held at target every month
      drift    buy & hold from the leg start
      monthly  back to target at each month end
      yearly   drift during the year, back to target after each December
    Every leg starts at its target weights. Saving rebuilds every series that uses this one;
    422 with `detail` when invalid or when it would create a cycle.
    `tags` are the series' tag ids."""
    name: str
    currency: str
    risk_profile: Optional[RiskProfile] = None
    rebalancing: Rebalancing = "monthly"
    legs: list[CustomLeg]
    tags: list[str] = []


class CustomSeries(CustomSeriesIn):
    id: str
    code: str
    created: str


class JobId(BaseModel):
    job_id: str


class Job(BaseModel):
    id: str
    status: JobStatus
    progress: int = 0  # 0-100
    result: Optional[Any] = None
    detail: Optional[str] = None  # error message shown in the UI banner


class Period(BaseModel):
    """Exact dates, as chosen with the period selector (same as the Dashboard): the period starts the day after
    `from` (the base) and ends on `to`. Use daily data where available; monthly data rounds to month ends."""
    from_: date = Field(alias="from")
    to: date


class DatedValue(BaseModel):
    date: date  # month end
    value: float  # monthly return, decimal


class ImportedSeriesIn(BaseModel):
    """A session-only Excel import: its monthly returns travel with the request and are never stored."""
    id: str
    name: str
    currency: str
    returns: list[DatedValue]


class ReportIn(BaseModel):
    """Needs reports.template.<template>, reports.format.<format> and, with `imported`, import.excel (403).
    Texts, months and number formats follow `language` (French: decimal comma)."""
    template: ReportTemplate
    format: ReportFormat = "pdf"
    language: ReportLanguage = "en"
    currency: Optional[str] = None  # convert every series to this currency; null = each instrument's own
    title: str
    prepared_for: str = ""
    period: Period
    sections: list[str]  # chart, dd, cal, det, bm, monthly
    instrument_ids: list[str]
    benchmarks: dict[str, Optional[str]] = {}  # benchmark per instrument as shown on screen; null = API default
    imported: list[ImportedSeriesIn] = []  # Excel imports among instrument_ids
