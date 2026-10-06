"""Route skeleton matching src/api/client.ts ENDPOINTS. Replace the TODOs with the real data access.

Rights: config/permissions.json, enforced with `require(...)` (see permissions.py)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from .schemas import (
    BenchmarkIn, TagsIn,
    AliasIn, AliasOut, CustomSeries, CustomSeriesIn, Folder, FolderIn, FolderPatch, Instrument, Job, JobId, Me,
    Limits, ReportIn, ReturnSeries, RiskFreeSeries, Tag, TagIn,
)
from .permissions import Rights, current_user, require

router = APIRouter(prefix="/api")


@router.get("/me", response_model=Me)
def me(user: Rights = Depends(current_user)) -> Me:
    return Me(user="…", level=user.profile, roles=user.roles, permissions=sorted(user.permissions),
              limits=Limits(selection=user.selection_limit))


@router.get("/instruments", response_model=list[Instrument])
def instruments(category: str | None = None, currency: str | None = None, risk: str | None = None, q: str | None = None): ...
    # the whole investable universe the caller may see (a few hundred); the Watchlist is defined by the folders
    # TODO: custom series (source == "custom") only with custom.view


@router.get("/instruments/{id}/returns", response_model=ReturnSeries)
def returns(id: str, frequency: str = "M", currency: str | None = None): ...  # D / W / M; convert when currency is given


@router.get("/risk-free", response_model=RiskFreeSeries)
def risk_free(currency: str, frequency: str = "M"): ...


@router.get("/instruments/{id}", response_model=Instrument)
def instrument(id: str): ...  # also when the instrument is a benchmark the caller can see


@router.put("/instruments/{id}/tags", response_model=Instrument)
def set_tags(id: str, body: TagsIn, user: Rights = Depends(current_user)):
    # tags.manage: any security; custom.manage: custom series only
    # if not (user.can("tags.manage") or (instrument.source == "custom" and user.can("custom.manage"))): raise HTTPException(403, ...)
    ...


@router.put("/instruments/{id}/benchmark", response_model=Instrument, dependencies=[require("benchmarks.security")])
def set_security_benchmark(id: str, body: BenchmarkIn): ...


@router.post("/instruments/{id}/alias", response_model=AliasOut, dependencies=[require("instruments.rename")])
def set_alias(id: str, body: AliasIn): ...


@router.get("/folders", response_model=list[Folder])
def list_folders(user: Rights = Depends(current_user)): ...
    # Watchlist folders for everyone; own folders with folders.personal; custom series folders with custom.view.
    # editable = user.can(FOLDER_EDIT[folder.kind])

# Permission needed to create, change or delete each kind of folder.
FOLDER_EDIT = {"system": "watchlist.manage", "user": "folders.personal", "custom": "custom.manage"}


def check_folder(kind: str, user: Rights) -> None:
    if not user.can(FOLDER_EDIT[kind]):
        raise HTTPException(403, "Your profile does not allow changing this folder.")


@router.post("/folders", response_model=Folder)
def create_folder(body: FolderIn, user: Rights = Depends(current_user)):
    check_folder(body.kind, user)
    ...
@router.patch("/folders/{id}", response_model=Folder)
def update_folder(id: str, body: FolderPatch, user: Rights = Depends(current_user)):
    # check_folder(folder.kind, user)
    ...
@router.delete("/folders/{id}", status_code=204)
def delete_folder(id: str, user: Rights = Depends(current_user)):
    # check_folder(folder.kind, user)
    ...


@router.get("/tags", response_model=list[Tag])
def list_tags(): ...
@router.post("/tags", response_model=Tag)
def create_tag(body: TagIn): ...  # tags.manage or custom.manage  # returns the existing tag if the name exists


@router.get("/custom-series", response_model=list[CustomSeries])
def list_custom(): ...
@router.post("/custom-series", response_model=CustomSeries, dependencies=[require("custom.manage")])
def create_custom(body: CustomSeriesIn): ...  # 422 with `detail` when a leg is invalid
@router.put("/custom-series/{id}", response_model=CustomSeries, dependencies=[require("custom.manage")])
def update_custom(id: str, body: CustomSeriesIn): ...  # rebuild dependents
@router.delete("/custom-series/{id}", status_code=204, dependencies=[require("custom.manage")])
def delete_custom(id: str):
    raise HTTPException(409, "Used by <names>. Remove it there first.")  # when other series depend on it


# Excel imports are session-only: parsed in the browser, never uploaded or stored.


@router.post("/reports", response_model=JobId)
def start_report(body: ReportIn, user: Rights = Depends(current_user)):
    needed = [f"reports.template.{body.template}", f"reports.format.{body.format}"]
    if body.imported:
        needed.append("import.excel")
    if not (user.can("reports.view") or user.can("reports.quick")):
        needed.append("reports.view")
    missing = [p for p in needed if not user.can(p)]
    if missing:
        raise HTTPException(403, f"Your profile does not allow this report ({missing[0]}).")
    ...
@router.get("/jobs/{id}", response_model=Job)
def job(id: str): ...
@router.get("/reports/{job_id}/file")
def report_file(job_id: str) -> Response:
    # return Response(content, media_type="application/pdf",
    #                 headers={"Content-Disposition": 'attachment; filename="Strategy_review_Comparison_2023-10_2026-09.pdf"'})
    ...
