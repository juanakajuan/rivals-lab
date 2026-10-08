import { releases } from "virtual:releases";
import type { PendingNote, Release } from "./releases.ts";

const releaseDate = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

interface DayEntry {
  readonly id: string;
  readonly date: string;
  readonly notes: readonly PendingNote[];
}

function groupByDate(items: readonly Release[]): DayEntry[] {
  const days: DayEntry[] = [];
  for (const release of items) {
    const last = days.at(-1);
    if (last?.date === release.date) {
      days[days.length - 1] = {
        ...last,
        notes: [...last.notes, ...release.notes],
      };
    } else {
      days.push(release);
    }
  }
  return days;
}

const days = groupByDate(releases);

export function Changelog(): React.JSX.Element {
  return (
    <main className="changelog-page" aria-labelledby="changelog-title">
      <div className="changelog-content">
        <h1 id="changelog-title">Changelog</h1>
        <p className="changelog-intro">
          Updates to deployed features. Latest first. Dates use UTC.
        </p>
        {days.map((release) => (
          <article
            className="release-entry"
            key={release.id}
            data-release-id={release.id}
          >
            <h2>
              <time dateTime={release.date}>
                {releaseDate.format(new Date(`${release.date}T00:00:00Z`))}
              </time>
            </h2>
            <ul>
              {release.notes.map((note) => (
                <li key={note.id} data-note-id={note.id}>
                  {note.text}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}
