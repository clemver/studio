# Timeseries Studio

GX app (React + TypeScript + Vite, FastAPI back end). See the handoff brief and `docs/GX_STYLE_GUIDE.md`.

```bash
npm install
cp .env.example .env     # VITE_USE_MOCK=true serves in-browser sample data
npm run dev              # http://localhost:5173
```

Sample-data helpers (mock mode only): `?level=standard|advanced` and `?admin=1|0` (or Settings in the sidebar),
`?mock_fail=<method>` to make a call fail (e.g. `?mock_fail=listInstruments`) and see the error banner.

Rights per user profile: `config/permissions.json` (permission catalogue, profiles with `extends` and selection
limit, additive roles such as `admin`). FastAPI loads it in `fastapi_contract/permissions.py`, enforces it with
`require(...)` and returns the resolved list in `GET /api/me`; the UI shows only what that list allows.

Switching to FastAPI: set `VITE_USE_MOCK=false` and `VITE_PROXY_TARGET`; routes are in `src/api/client.ts`
(`ENDPOINTS`), the wire shape only in `src/api/adapters.ts`, the Pydantic models in `fastapi_contract/schemas.py`.

## Layout
- `src/api/` contract, HTTP client, adapters, mock
- `src/hooks/` one hook per page + shared loaders (catalogue, report job polling)
- `src/components/` presentational only; `src/lib/` pure maths, formats, chart and report builders
- `src/state/studio.tsx` session level, catalogue, selection and period shared by pages
