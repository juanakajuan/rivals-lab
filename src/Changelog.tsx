import { releases } from "virtual:releases";
import { Card } from "./components/ui/card";
import { Separator } from "./components/ui/separator";

const releaseDate = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function Changelog(): React.JSX.Element {
  return (
    <main className="changelog-page" aria-labelledby="changelog-title">
      <div className="changelog-content">
        <h1 id="changelog-title">Changelog</h1>
        <p className="changelog-intro">
          Updates to deployed features. Latest first. Dates use UTC.
        </p>
        {releases.map((release) => (
          <Card
            render={<article />}
            className="release-entry gap-4 p-5"
            key={release.id}
            data-release-id={release.id}
          >
            <h2>
              <time dateTime={release.date}>
                {releaseDate.format(new Date(`${release.date}T00:00:00Z`))}
              </time>
            </h2>
            <Separator />
            <ul className="list-disc space-y-2 pl-5 leading-relaxed">
              {release.notes.map((note) => (
                <li key={note.id} data-note-id={note.id}>
                  {note.text}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </main>
  );
}
