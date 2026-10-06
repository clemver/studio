/* Custom series (/custom, Advanced): library | editor. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStudio } from '../state/studio';
import { useCustomSeries } from '../hooks/useCustomSeries';
import type { Rebalancing, RiskProfile } from '../types';
import { CURRENCIES, REBALANCING, RISKS } from '../lib/domain';
import { ErrorBanner } from '../components/ErrorBanner';
import { Icon } from '../components/Icons';
import { Tabs } from '../components/Tabs';
import { TagPicker } from '../components/TagPicker';
import { Chip } from '../components/Chip';
import { StatusIcon } from '../components/StatusIcon';
import type { Anchor } from '../components/Menu';
import { InstrumentPicker } from '../components/InstrumentPicker';
import { CustomLibrary } from '../components/custom/CustomLibrary';
import { LegEditor } from '../components/custom/LegEditor';

const DISCARD = 'Discard your unsaved changes?';

export function CustomSeriesPage() {
  const s = useStudio();
  const cs = useCustomSeries();
  const cat = s.catalogue;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [pick, setPick] = useState<{ leg: number; anchor: Anchor } | null>(null);
  const [tagPick, setTagPick] = useState<HTMLElement | null>(null);
  const d = cs.draft;

  // Deep links: /custom?edit=<id> (explorer row menu) and /custom?new=1.
  useEffect(() => {
    if (!cs.defs || !cat.grid) return;
    const edit = params.get('edit');
    if (edit && d?.id !== edit) cs.openId(edit);
    else if (params.get('new') && !d) cs.openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs.defs, cat.grid, params]);

  const guard = (fn: () => void) => { if (!cs.dirty || window.confirm(DISCARD)) fn(); };
  const open = (id: string) => guard(() => { cs.openId(id); setParams({ edit: id }, { replace: true }); });
  const openNew = () => guard(() => { cs.openNew(); setParams({ new: '1' }, { replace: true }); });

  const issues = cs.built?.issues ?? [];
  const general = issues.filter(x => x.leg == null);
  const ongoingUntil = useMemo(() => {
    const last = cs.built?.legs[cs.built.legs.length - 1];
    return last && last.e >= 0 && cat.grid ? cat.grid.key(last.e) : null;
  }, [cs.built, cat.grid]);

  const save = async () => {
    const res = await cs.save();
    if (res) {
      setParams({ edit: res.id }, { replace: true });
      s.showToast(`Saved “${res.name}”. It is in the explorer under Custom series.`);
      s.notify('done', `Custom series “${res.name}” saved`);
    }
  };

  const pickable = cat.instruments.filter(i => !cs.excluded.includes(i.id));

  return (
    <section className="page">
      <ErrorBanner error={cs.error} onDismiss={cs.clearError} onRetry={cs.defs ? undefined : cs.reload} />
      <ErrorBanner error={cat.error} onDismiss={cat.clearError} onRetry={cat.reload} />
      <div className="ux cs">
        <CustomLibrary defs={cs.defs} tags={s.tags} currentId={d?.id ?? null} onOpen={open} onNew={openNew}
          onDuplicate={id => guard(() => { cs.duplicate(id); setParams({ new: '1' }, { replace: true }); })}
          onSelect={id => { if (s.select(id)) s.showToast('Added to the selection'); else s.showToast(`Selection is full (${s.limit}).`); }}
          onDelete={async id => { const ok = await cs.remove(id); if (ok) { s.showToast('Custom series deleted'); setParams({}, { replace: true }); } return ok; }} />

        <div className="ux-panel cs-ed" aria-label="Editor">
          {!d || !cat.grid ? (
            <div className="cs-empty">
              {cat.loading ? 'Loading instruments…' : <>
                <span>Pick a custom series on the left to edit it, or build a new one from instruments in the catalogue.</span>
                <button type="button" className="btn" onClick={openNew}><Icon.plus />New custom series</button>
              </>}
            </div>
          ) : <>
            <div className="gx-hd">
              <h2>{d.id ? d.name || 'Untitled' : 'New custom series'}</h2>
              {d.code && <span className="cnt num">{d.code}</span>}
              {cs.dirty && <span className="dirty">Unsaved changes</span>}
              <span className="rt">
                <button type="button" className="btn ghost" onClick={() => guard(() => { cs.close(); setParams({}, { replace: true }); })}>{cs.dirty ? 'Cancel' : 'Close'}</button>
                {d.id && !cs.dirty && <button type="button" className="btn ghost" onClick={() => { s.select(d.id!); navigate('/explorer'); }}>Show in explorer</button>}
                <button type="button" className="btn sec" disabled={!cs.dirty || issues.length > 0 || cs.busy} onClick={save}
                  data-tip={issues.length ? `Fix ${issues.length} issue${issues.length === 1 ? '' : 's'} first` : cs.dirty ? 'Save and rebuild every series that uses it' : 'No changes'}>
                  {cs.busy ? 'Saving…' : 'Save'}
                </button>
              </span>
            </div>

            <div className="ux-scroll">
              <div className="cs-sec">
                <h3>General</h3>
                <div className="cs-grid">
                  <div className="fld"><label htmlFor="csName">Name</label>
                    <input id="csName" className="inp" maxLength={80} placeholder="e.g. Core-Satellite CHF" value={d.name} onChange={ev => cs.update({ name: ev.target.value })} /></div>
                  <div className="fld"><label htmlFor="csCcy">Currency</label>
                    <select id="csCcy" className="sel" value={d.currency} onChange={ev => cs.update({ currency: ev.target.value })}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                  <div className="fld"><label htmlFor="csRisk">Risk profile</label>
                    <select id="csRisk" className="sel" value={d.riskProfile ?? ''} onChange={ev => cs.update({ riskProfile: (ev.target.value || null) as RiskProfile | null })}>
                      <option value="">None</option>
                      {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select></div>
                  <div className="fld span"><span className="lb">Rebalancing</span>
                    <Tabs ariaLabel="Rebalancing" value={d.rebalancing} onChange={(v: Rebalancing) => cs.update({ rebalancing: v })}
                      items={(Object.keys(REBALANCING) as Rebalancing[]).map(k => ({ key: k, label: REBALANCING[k].label }))} />
                    <span className="help">{REBALANCING[d.rebalancing].help} Every leg starts at its target weights.</span></div>
                  <div className="fld span"><span className="lb">Tags</span>
                    <div className="tagfield">
                      {d.tags.map(t => <Chip key={t} removeLabel={`tag ${s.tagName(t)}`} onRemove={() => cs.update({ tags: d.tags.filter(x => x !== t) })}>{s.tagName(t)}</Chip>)}
                      <button type="button" className="btn ghost" aria-haspopup="dialog" aria-expanded="false" onClick={ev => setTagPick(ev.currentTarget)}>
                        <Icon.plus />{d.tags.length ? 'Edit tags' : 'Add tags'}
                      </button>
                    </div>
                    <span className="help">Labels to classify and filter securities. Tags don't put anything in folders.</span></div>
                </div>
              </div>

              <div className="cs-sec">
                <h3>Legs <span className="dim num">({d.legs.length})</span><span className="sp" />
                  <button type="button" className="btn" onClick={cs.addLeg}><Icon.plus />Add leg</button></h3>
                <p className="help" style={{ margin: '-6px 0 12px' }}>Legs follow each other month by month. Each leg has its own instruments, weights and fees; only the last leg can be ongoing.</p>
                {d.legs.map((leg, k) => (
                  <LegEditor key={k} index={k} leg={leg} isLast={k === d.legs.length - 1} canRemove={d.legs.length > 1} grid={cat.grid!} currency={d.currency}
                    ongoingUntil={k === d.legs.length - 1 ? ongoingUntil : null} issues={issues.filter(x => x.leg === k)}
                    recordOf={id => cat.byId.get(id)} onChange={p => cs.updateLeg(k, p)} onRemove={() => cs.removeLeg(k)}
                    onPick={el => setPick({ leg: k, anchor: { el } })} />
                ))}
              </div>
            </div>

            <div className="cs-foot">
              {issues.length
                ? <span className="msgline"><StatusIcon kind="error" message="Issues" />{issues.length} issue{issues.length === 1 ? '' : 's'} to fix{general.length ? `: ${general[0].message}` : ' in the legs above'}</span>
                : <span className="msgline"><StatusIcon kind="done" message="Valid" />Ready to save</span>}
              <span className="sp" />
              <button type="button" className="btn sec" disabled={!cs.dirty || issues.length > 0 || cs.busy} onClick={save}>{cs.busy ? 'Saving…' : 'Save'}</button>
            </div>
          </>}
        </div>

      </div>

      {tagPick && d && (
        <TagPicker anchor={{ el: tagPick }} subtitle={d.name || 'New custom series'} value={d.tags} tags={s.tags} counts={s.tagCounts}
          onCreate={s.ensureTag} onClose={() => setTagPick(null)} onDone={ids => cs.update({ tags: ids })} />
      )}
      {pick && d && (
        <InstrumentPicker anchor={pick.anchor} title={`Add to leg ${pick.leg + 1}`} instruments={pickable}
          taken={d.legs[pick.leg]?.components.map(c => c.id)} onClose={() => setPick(null)}
          onAdd={ids => {
            const leg = d.legs[pick.leg];
            const comps = [...leg.components, ...ids.map(id => ({ id, weight: 0 }))];
            // A first instrument gets 100%; otherwise new rows start at 0% for the user to set.
            if (!leg.components.length && comps.length === 1) comps[0].weight = 100;
            cs.updateLeg(pick.leg, { components: comps });
          }} />
      )}
    </section>
  );
}
