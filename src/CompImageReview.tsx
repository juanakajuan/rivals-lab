import { Dialog } from "./ui/Dialog";
import { COMP_MAPS } from "./compMaps";
import type { Comp } from "./comps";
import { draftSlots } from "./draft";
import { HERO_BY_ID, selectedHeroRole, teamLabel, type Team } from "./heroes";

const TEAMS: readonly Team[] = ["ally", "enemy"];

export function CompImageReview({
  comp,
  onClose,
  onOpen,
}: {
  readonly comp: Comp;
  readonly onClose: () => void;
  readonly onOpen: () => void;
}): React.JSX.Element {
  return (
    <Dialog
      appearance="builder"
      title="Review imported comp"
      openOnMount
      onRequestClose={onClose}
      onCancel={onClose}
    >
      <p className="muted-copy">
        This comp is not saved. Review it before you open it in the editor.
      </p>
      <div className="image-import-review">
        <h3>Name</h3>
        <p>{comp.name.trim() ? comp.name : "Unnamed comp"}</p>
        <h3>Map</h3>
        <p>
          {COMP_MAPS.find((map) => map.id === comp.mapId)?.name ?? "Any map"}
        </p>
        {TEAMS.map((team) => (
          <section key={team} aria-label={`${teamLabel(team)} imported slots`}>
            <h3>{teamLabel(team)}</h3>
            <ol>
              {comp.teams[team].map((slot, index) => (
                <li key={index}>
                  <strong>
                    Slot {index + 1}:{" "}
                    {slot.heroId
                      ? HERO_BY_ID.get(slot.heroId)?.name
                      : "Empty slot"}
                  </strong>
                  <p>
                    {selectedHeroRole(slot.heroId, slot.deadpoolRole) ??
                      "No role selected"}
                  </p>
                  <p>{slot.notes || "No slot notes"}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <h3>Draft</h3>
        {comp.draft ? (
          <>
            <p>{comp.draft.format === "mrc" ? "MRC" : "Ignite"}</p>
            <ol>
              {draftSlots(comp.draft).map((slot) => (
                <li key={`${slot.team}-${slot.kind}-${slot.index}`}>
                  {teamLabel(slot.team)} {slot.kind} {slot.index + 1}:{" "}
                  {slot.heroId
                    ? HERO_BY_ID.get(slot.heroId)?.name
                    : "Empty slot"}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>Free build</p>
        )}
        <h3>Comp notes</h3>
        <p>{comp.notes || "No comp notes"}</p>
      </div>
      <div className="dialog-actions">
        <button
          autoFocus
          type="button"
          className="secondary-button"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onOpen}>
          Open in editor
        </button>
      </div>
    </Dialog>
  );
}
