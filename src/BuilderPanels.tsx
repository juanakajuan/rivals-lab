import { useState, type RefObject } from "react";
import { Ban, Search, ShieldCheck, X } from "lucide-react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { ModalDialog } from "./ModalDialog";
import { draftSlots, type DraftState, type DraftSlot } from "./draft";
import type { CompEdit } from "./compEdits";
import {
  DEADPOOL_ROLES,
  HEROES,
  HERO_BY_ID,
  heroImagePath,
  isDeadpoolRole,
  selectedHeroRole,
  teamLabel,
  type DeadpoolRole,
  type HeroDefinition,
  type HeroSelection,
  type Team,
  type HeroRole,
} from "./heroes";
import type { CompSlot } from "./comps";

interface HeroOption extends HeroDefinition {
  readonly deadpoolRole?: DeadpoolRole;
}

export function HeroPicker({
  title,
  mode,
  unavailable,
  onChoose,
  onClose,
  fallbackFocusRef,
}: {
  readonly title: string;
  readonly mode: "comp" | "draft";
  readonly unavailable: (heroId: string) => string | null;
  readonly onChoose: (selection: HeroSelection) => void;
  readonly onClose: () => void;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<HeroRole | "All">("All");
  const roles: readonly (HeroRole | "All")[] =
    mode === "comp"
      ? ["All", ...DEADPOOL_ROLES]
      : ["All", ...DEADPOOL_ROLES, "All Roles"];
  const options = HEROES.flatMap((hero): readonly HeroOption[] => {
    if (hero.id !== "deadpool" || mode !== "comp") return [hero];
    return DEADPOOL_ROLES.map((deadpoolRole) => ({
      ...hero,
      role: deadpoolRole,
      deadpoolRole,
    }));
  });
  const query = search.trim().toLowerCase();
  const heroes = options.filter(
    (hero) =>
      hero.name.toLowerCase().includes(query) &&
      (role === "All" || hero.role === role || hero.role === "All Roles"),
  );
  return (
    <ModalDialog
      title={title}
      onClose={onClose}
      fallbackFocusRef={fallbackFocusRef}
    >
      <label className="builder-search">
        <Search size={16} />
        <input
          autoFocus
          type="search"
          aria-label="Find a hero"
          placeholder="Find a hero…"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </label>
      <div className="role-filters" aria-label="Hero roles">
        {roles.map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={role === item}
            onClick={() => setRole(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="hero-choice-grid">
        {heroes.map((hero) => {
          const reason = unavailable(hero.id);
          const label = `${hero.name}${hero.deadpoolRole ? ` · ${hero.deadpoolRole}` : ""}`;
          const selection: HeroSelection = hero.deadpoolRole
            ? { heroId: hero.id, deadpoolRole: hero.deadpoolRole }
            : { heroId: hero.id };
          return (
            <button
              key={`${hero.id}-${hero.deadpoolRole ?? ""}`}
              type="button"
              className="hero-choice"
              disabled={reason !== null}
              title={reason ?? hero.role}
              aria-label={`${label}${reason ? ` — ${reason}` : ""}`}
              onClick={() => onChoose(selection)}
            >
              <img src={heroImagePath(hero.id)} alt="" />
              <strong>{hero.name}</strong>
              <small>{reason ?? hero.role}</small>
            </button>
          );
        })}
      </div>
      {heroes.length === 0 && (
        <p className="empty-copy">No heroes match this search.</p>
      )}
    </ModalDialog>
  );
}

export function DraftPanel({
  draft,
  onEdit,
  onChoose,
}: {
  readonly draft: DraftState;
  readonly onEdit: (edit: CompEdit) => void;
  readonly onChoose: (slot: DraftSlot) => void;
}): React.JSX.Element {
  const slots = draftSlots(draft);
  const filled = slots.filter((slot) => slot.heroId !== null).length;
  const teams: readonly Team[] = ["ally", "enemy"];
  return (
    <section
      className="builder-card draft-panel"
      aria-labelledby="draft-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {draft.format === "mrc" ? "MRC" : "Ignite"} draft
          </p>
          <h2 id="draft-heading">Bans And Saves</h2>
        </div>
        <span className="status-tag">
          {filled} / {slots.length} choices set
        </span>
      </div>
      <p className="muted-copy">
        {draft.format === "mrc"
          ? "4 bans + 2 saves per team. Bans and saves apply to both teams."
          : "5 bans + 2 saves per team. Ban for the opponent. Save for your team."}{" "}
        Fill any slot. Each choice takes effect at once.
      </p>
      <div className="draft-timeline">
        {teams.map((team) => (
          <section
            className="draft-team-row"
            data-team={team}
            key={team}
            aria-label={`${teamLabel(team)} bans and saves`}
          >
            <h3 className="draft-team-heading">
              <span className="team-dot" />
              {teamLabel(team)}
            </h3>
            <ol
              className="draft-team-steps"
              aria-label={`${teamLabel(team)} draft slots`}
            >
              {slots
                .filter((slot) => slot.team === team)
                .map((slot) => {
                  const label = `${teamLabel(team)} ${slot.kind} ${slot.index + 1}`;
                  const hero = slot.heroId
                    ? HERO_BY_ID.get(slot.heroId)
                    : undefined;
                  return (
                    <li
                      key={`${slot.kind}-${slot.index}`}
                      className={`draft-step${hero ? " done" : ""}`}
                      data-action={slot.kind}
                    >
                      <button
                        type="button"
                        className="draft-slot-button"
                        aria-label={`${label}: ${hero?.name ?? "Choose hero"}`}
                        onClick={() => onChoose(slot)}
                      >
                        <span className="step-number">
                          {slot.kind === "ban" ? "Ban" : "Save"}{" "}
                          {slot.index + 1}
                        </span>
                        <span className="draft-step-choice" data-team={team}>
                          <span
                            className={`draft-portrait${hero ? " has-hero" : ""}`}
                          >
                            {hero ? (
                              <img src={heroImagePath(hero.id)} alt="" />
                            ) : (
                              <span className="draft-placeholder">
                                {slot.kind === "save" ? (
                                  <ShieldCheck size={22} />
                                ) : (
                                  <Ban size={22} />
                                )}
                              </span>
                            )}
                            {hero && (
                              <span
                                className="draft-action-badge"
                                aria-hidden="true"
                              >
                                {slot.kind === "save" ? (
                                  <ShieldCheck size={12} />
                                ) : (
                                  <Ban size={12} />
                                )}
                              </span>
                            )}
                          </span>
                          <span>
                            <strong>{hero?.name ?? "Choose hero"}</strong>
                          </span>
                        </span>
                      </button>
                      {hero && (
                        <button
                          type="button"
                          className="draft-clear icon-button"
                          aria-label={`Clear ${label}`}
                          onClick={() =>
                            onEdit({
                              kind: "clearHero",
                              target: { kind: "draft", slot },
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}
      </div>
      <div className="draft-controls">
        <button
          type="button"
          className="secondary-button"
          disabled={!filled}
          onClick={() => {
            if (
              window.confirm(
                "Reset all bans and saves? Comp heroes and notes will stay.",
              )
            )
              onEdit({ kind: "resetDraft" });
          }}
        >
          Reset draft
        </button>
      </div>
    </section>
  );
}

export function TeamEditor({
  team,
  slots,
  banned,
  onChoose,
  onEdit,
  onReset,
}: {
  readonly team: Team;
  readonly slots: readonly CompSlot[];
  readonly banned: ReadonlySet<string>;
  readonly onChoose: (index: number) => void;
  readonly onEdit: (edit: CompEdit) => void;
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
    <section
      className="builder-card team-editor"
      data-team={team}
      aria-label={`${label} composition`}
    >
      <div className="section-heading">
        <h2>
          <span className="team-dot" />
          {label} <small>{count} / 6</small>
        </h2>
        <div className="team-editor-actions">
          <span className="muted-copy">
            {team === "enemy" ? "Optional" : "Any role mix"}
          </span>
          <button
            type="button"
            className="secondary-button"
            aria-label={`Reset ${label}`}
            disabled={
              !slots.some(
                (slot) => slot.heroId !== null || slot.notes.length > 0,
              )
            }
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      </div>
      <p className="role-counts">
        {roles.size
          ? [...roles].map(([role, total]) => `${total} ${role}`).join(" · ")
          : "Choose heroes to build your comp."}
      </p>
      <div className="comp-slots">
        {slots.map((slot, index) => {
          const hero = slot.heroId ? HERO_BY_ID.get(slot.heroId) : undefined;
          const conflict = Boolean(slot.heroId && banned.has(slot.heroId));
          const slotLabel = `${label} slot ${index + 1}`;
          return (
            <div
              key={index}
              className={`comp-slot${conflict ? " has-conflict" : ""}`}
            >
              <button
                className="slot-select"
                type="button"
                onClick={() => onChoose(index)}
                aria-label={`${slotLabel}: ${hero?.name ?? "Choose hero"}`}
              >
                {hero ? (
                  <img src={heroImagePath(hero.id)} alt="" />
                ) : (
                  <span className="empty-slot-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                <span>
                  <strong>{hero?.name ?? "Choose hero"}</strong>
                  <small>
                    {selectedHeroRole(slot.heroId, slot.deadpoolRole) ??
                      "Empty slot"}
                  </small>
                </span>
              </button>
              {hero && (
                <button
                  type="button"
                  className="slot-remove icon-button"
                  aria-label={`Remove ${hero.name} from ${label}`}
                  onClick={() =>
                    onEdit({
                      kind: "clearHero",
                      target: { kind: "slot", team, index },
                    })
                  }
                >
                  <X size={14} />
                </button>
              )}
              {hero?.id === "deadpool" && (
                <select
                  className="deadpool-role"
                  aria-label={`${slotLabel} Deadpool role`}
                  value={slot.deadpoolRole ?? ""}
                  onChange={(event) => {
                    const deadpoolRole = event.currentTarget.value;
                    if (isDeadpoolRole(deadpoolRole))
                      onEdit({
                        kind: "deadpoolRole",
                        team,
                        index,
                        role: deadpoolRole,
                      });
                  }}
                >
                  <option value="" disabled>
                    Choose Deadpool role
                  </option>
                  {DEADPOOL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              )}
              {conflict && (
                <span className="conflict-copy">Banned for this team</span>
              )}
              <AutoGrowTextarea
                aria-label={`${slotLabel} notes`}
                placeholder="Slot notes…"
                maxLength={10_000}
                rows={2}
                value={slot.notes}
                onChange={(event) =>
                  onEdit({
                    kind: "slotNotes",
                    team,
                    index,
                    notes: event.currentTarget.value,
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
