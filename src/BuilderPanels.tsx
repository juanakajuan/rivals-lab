import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, ShieldCheck, Swords, X } from 'lucide-react';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { draftPhases, draftProgress, type DraftState } from './draft';
import {
  DEADPOOL_ROLES, HEROES, HERO_BY_ID, heroImagePath, isDeadpoolRole, selectedHeroRole, teamLabel,
  type DeadpoolRole, type HeroDefinition, type HeroSelection, type Team, type HeroRole
} from './heroes';
import type { CompSlot } from './comps';

export function BuilderDialog({ title, onClose, children }: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="builder-dialog" aria-label={title} onCancel={onClose}>
      <div className="dialog-heading"><h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}

interface HeroOption extends HeroDefinition {
  readonly deadpoolRole?: DeadpoolRole;
}

export function HeroPicker({ title, mode, unavailable, onChoose, onClose }: {
  readonly title: string;
  readonly mode: 'comp' | 'draft';
  readonly unavailable: (heroId: string) => string | null;
  readonly onChoose: (selection: HeroSelection) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<HeroRole | 'All'>('All');
  const roles: readonly (HeroRole | 'All')[] = mode === 'comp'
    ? ['All', ...DEADPOOL_ROLES] : ['All', ...DEADPOOL_ROLES, 'All Roles'];
  const options = HEROES.flatMap((hero): readonly HeroOption[] => {
    if (hero.id !== 'deadpool' || mode !== 'comp') return [hero];
    return DEADPOOL_ROLES.map((deadpoolRole) => ({ ...hero, role: deadpoolRole, deadpoolRole }));
  });
  const query = search.trim().toLowerCase();
  const heroes = options.filter((hero) => hero.name.toLowerCase().includes(query) &&
    (role === 'All' || hero.role === role || hero.role === 'All Roles'));
  return (
    <BuilderDialog title={title} onClose={onClose}>
      <label className="builder-search"><Search size={16} />
        <input autoFocus type="search" aria-label="Find a hero" placeholder="Find a hero…" value={search}
          onChange={(event) => setSearch(event.currentTarget.value)} />
      </label>
      <div className="role-filters" aria-label="Hero roles">
        {roles.map((item) => <button type="button" key={item} aria-pressed={role === item}
          onClick={() => setRole(item)}>{item}</button>)}
      </div>
      <div className="hero-choice-grid">
        {heroes.map((hero) => {
          const reason = unavailable(hero.id);
          const label = `${hero.name}${hero.deadpoolRole ? ` · ${hero.deadpoolRole}` : ''}`;
          const selection: HeroSelection = hero.deadpoolRole
            ? { heroId: hero.id, deadpoolRole: hero.deadpoolRole }
            : { heroId: hero.id };
          return <button key={`${hero.id}-${hero.deadpoolRole ?? ''}`} type="button" className="hero-choice" disabled={reason !== null}
            title={reason ?? hero.role} aria-label={`${label}${reason ? ` — ${reason}` : ''}`}
            onClick={() => onChoose(selection)}>
            <img src={heroImagePath(hero.id)} alt="" />
            <strong>{hero.name}</strong><small>{reason ?? hero.role}</small>
          </button>;
        })}
      </div>
      {heroes.length === 0 && <p className="empty-copy">No heroes match this search.</p>}
    </BuilderDialog>
  );
}

export function DraftPanel({ draft, onChange, onChoose }: {
  readonly draft: DraftState;
  readonly onChange: (draft: DraftState) => void;
  readonly onChoose: () => void;
}): React.JSX.Element {
  const progress = draftProgress(draft);
  const phases = draftPhases(draft);
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rows = timelineRef.current?.querySelectorAll('.draft-team-steps');
    rows?.forEach((row) => {
      const current = row.querySelector('[aria-current="step"]');
      if (!(row instanceof HTMLElement) || !(current instanceof HTMLElement)) return;
      row.scrollLeft += current.getBoundingClientRect().left - row.getBoundingClientRect().left -
        (row.clientWidth - current.offsetWidth) / 2;
    });
  }, [progress.phaseIndex]);
  const teams: readonly Team[] = ['ally', 'enemy'];
  let offset = 0;
  const steps = phases.flatMap((phase, phaseIndex) => {
    const start = offset;
    offset += phase.length;
    return phase.map((action, actionIndex) => ({
      ...action,
      phaseIndex,
      heroId: draft.choices[start + actionIndex],
      simultaneous: phase.length > 1,
      done: draft.choices.length >= offset
    }));
  });
  return (
    <section className="builder-card draft-panel" aria-labelledby="draft-heading">
      <div className="section-heading">
        <div><p className="eyebrow">{draft.format === 'mrc' ? 'MRC' : 'Ignite'} draft</p>
          <h2 id="draft-heading">{progress.action
            ? `${teamLabel(progress.action.team)} ${progress.action.kind}` : 'Draft complete'}</h2>
        </div>
        <span className="status-tag">{progress.action ? `Step ${progress.phaseIndex + 1} / ${phases.length}` : 'All choices set'}</span>
      </div>
      <p className="muted-copy">{draft.format === 'mrc'
        ? '4 bans + 2 saves per team. Bans and saves apply to both teams.'
        : '5 bans + 2 saves per team. Ban for the opponent. Save for your team.'}</p>
      <div ref={timelineRef} className="draft-timeline">
        {teams.map((team) => <section className="draft-team-row" data-team={team} key={team}
          aria-label={`${teamLabel(team)} bans and saves`}>
          <h3 className="draft-team-heading"><span className="team-dot" />{teamLabel(team)}</h3>
          <ol className="draft-team-steps" aria-label={`${teamLabel(team)} draft steps`}>
            {steps.filter((step) => step.team === team).map((step) => <li key={step.phaseIndex}
              className={`draft-step ${step.phaseIndex === progress.phaseIndex ? 'current' : ''} ${step.done ? 'done' : ''}`}
              aria-current={step.phaseIndex === progress.phaseIndex ? 'step' : undefined}>
              <span className="step-number">Step {step.phaseIndex + 1}{step.simultaneous ? ' · Both ban' : ''}</span>
              <div className="draft-step-choice" data-team={team}>
                {step.heroId ? <img src={heroImagePath(step.heroId)} alt="" /> :
                  <span className="draft-placeholder">{step.kind === 'save' ? <ShieldCheck size={15} /> : <Swords size={15} />}</span>}
                <span><small>{step.kind === 'ban' ? 'Ban' : 'Save'}</small>
                  <strong>{step.heroId ? HERO_BY_ID.get(step.heroId)?.name : '—'}</strong></span>
              </div>
            </li>)}
          </ol>
        </section>)}
      </div>
      {progress.phase.length > 1 && <p className="joint-note">Simultaneous bans · {progress.pendingChoices.length} / 2 choices entered.
        Both bans take effect together.{draft.format === 'mrc' ? ' Both teams may select the same hero.' : ''}</p>}
      <div className="draft-controls">
        {progress.action && <button type="button" className="primary-button" onClick={onChoose}>
          {progress.action.kind === 'ban' ? 'Choose ban' : 'Choose save'} · {teamLabel(progress.action.team)}
        </button>}
        <button type="button" className="secondary-button" disabled={!draft.choices.length}
          onClick={() => onChange({ ...draft, choices: draft.choices.slice(0, -1) })}>Undo</button>
        <button type="button" className="secondary-button" disabled={!draft.choices.length} onClick={() => {
          if (window.confirm('Reset all bans and saves? Comp heroes and notes will stay.')) onChange({ ...draft, choices: [] });
        }}>Reset draft</button>
      </div>
    </section>
  );
}

export function TeamEditor({ team, slots, banned, onChoose, onChange, onReset }: {
  readonly team: Team;
  readonly slots: readonly CompSlot[];
  readonly banned: ReadonlySet<string>;
  readonly onChoose: (index: number) => void;
  readonly onChange: (index: number, slot: CompSlot) => void;
  readonly onReset: () => void;
}): React.JSX.Element {
  const label = teamLabel(team);
  const count = slots.filter((slot) => slot.heroId).length;
  const roles = new Map<HeroRole, number>();
  for (const slot of slots) {
    const role = selectedHeroRole(slot.heroId, slot.deadpoolRole);
    if (role) roles.set(role, (roles.get(role) ?? 0) + 1);
  }
  return (
    <section className="builder-card team-editor" data-team={team} aria-label={`${label} composition`}>
      <div className="section-heading">
        <h2><span className="team-dot" />{label} <small>{count} / 6</small></h2>
        <div className="team-editor-actions">
          <span className="muted-copy">{team === 'enemy' ? 'Optional' : 'Any role mix'}</span>
          <button type="button" className="secondary-button" aria-label={`Reset ${label}`}
            disabled={!slots.some((slot) => slot.heroId !== null || slot.notes.length > 0)} onClick={onReset}>Reset</button>
        </div>
      </div>
      <p className="role-counts">{roles.size ? [...roles].map(([role, total]) => `${total} ${role}`).join(' · ') : 'Choose heroes to build your comp.'}</p>
      <div className="comp-slots">
        {slots.map((slot, index) => {
          const hero = slot.heroId ? HERO_BY_ID.get(slot.heroId) : undefined;
          const conflict = Boolean(slot.heroId && banned.has(slot.heroId));
          const slotLabel = `${label} slot ${index + 1}`;
          return <div key={index} className={`comp-slot${conflict ? ' has-conflict' : ''}`}>
            <button className="slot-select" type="button" onClick={() => onChoose(index)}
              aria-label={`${slotLabel}: ${hero?.name ?? 'Choose hero'}`}>
              {hero ? <img src={heroImagePath(hero.id)} alt="" /> : <span className="empty-slot-number">{String(index + 1).padStart(2, '0')}</span>}
              <span><strong>{hero?.name ?? 'Choose hero'}</strong><small>{selectedHeroRole(slot.heroId, slot.deadpoolRole) ?? 'Empty slot'}</small></span>
            </button>
            {hero && <button type="button" className="slot-remove icon-button" aria-label={`Remove ${hero.name} from ${label}`}
              onClick={() => onChange(index, { heroId: null, notes: slot.notes })}><X size={14} /></button>}
            {hero?.id === 'deadpool' && <select className="deadpool-role" aria-label={`${slotLabel} Deadpool role`}
              value={slot.deadpoolRole ?? ''} onChange={(event) => {
                const deadpoolRole = event.currentTarget.value;
                if (isDeadpoolRole(deadpoolRole)) onChange(index, { ...slot, deadpoolRole });
              }}>
              <option value="" disabled>Choose Deadpool role</option>
              {DEADPOOL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>}
            {conflict && <span className="conflict-copy">Banned for this team</span>}
            <AutoGrowTextarea aria-label={`${slotLabel} notes`} placeholder="Slot notes…" maxLength={10_000}
              rows={2} value={slot.notes} onChange={(event) => onChange(index, { ...slot, notes: event.currentTarget.value })} />
          </div>;
        })}
      </div>
    </section>
  );
}
