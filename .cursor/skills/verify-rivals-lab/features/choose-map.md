# Choose a map

Choose a map lets a user replace the Position Board map with a built-in map or a custom image, search the picker, and close it without a change.

## Sub-features

- `map-open` opens the picker from `Choose map`.
- `map-choose` switches the board to Museum of Contemplation.
- `map-search` filters the picker and shows the empty search state.
- `map-close` closes the picker without changing the current map.
- `map-upload` rejects a non-image and accepts a small PNG.

## How to get to it (user POV)

- On the Position Board, choose `Choose map`.
- In the picker, choose a map card, search with `Search maps`, choose `Close map picker`, or choose `Upload image`.

## Driving it with verify.mjs

Preconditions:

- Doctor reports the verification URL and a private browser profile.
- The page is the Position Board.
- The heading is `Intergalactic Empire of Wakanda: Birnin T'Challa`.

- **Open the picker.** Choose `Choose map`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs goto /board` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Choose map"`. A dialog named `Choose map` is present, with a searchbox named `Search maps`.
- **Search.** Type `museum`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs fill --role searchbox --name "Search maps" --value "museum"`. `Museum of Contemplation` is present and `Hydra Charteris Base: Hell's Heaven` has count `0`.
- **Empty search.** Replace the query with `volcano`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs fill --role searchbox --name "Search maps" --value "volcano"`. The status `No maps match your search.` is present.
- **Close.** Choose `Close map picker`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Close map picker"`. The heading is still `Intergalactic Empire of Wakanda: Birnin T'Challa`.
- **Choose a map.** Open the picker again and choose Museum of Contemplation. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Choose map"` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Museum of Contemplation"`. The dialog is gone and the heading is `Museum of Contemplation`.
- **Reject a bad upload.** Open the picker and give the file input an SVG. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Choose map"` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs set-input-files --label "Upload map image" --file static/favicon.svg`. The alert `Choose a PNG, JPEG, WebP, or GIF image.` is present and the heading is still `Museum of Contemplation`.
- **Upload a PNG.** Write a 1×1 PNG, then choose it. Run `node --input-type=module -e "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('artifacts/verify/choose-map', { recursive: true }); writeFileSync('artifacts/verify/choose-map/sample.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));"` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs set-input-files --label "Upload map image" --file artifacts/verify/choose-map/sample.png`. The picker closes and the heading is `sample.png`.
- **Proof.** Capture the custom map. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs snapshot --path artifacts/verify/choose-map/uploaded.aria.yml` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs screenshot --path artifacts/verify/choose-map/uploaded.png`. Both artifacts show `Rivals Lab` and `sample.png`.

## Gotchas

- The picker button's accessible name is the map name, such as `Museum of Contemplation` or `Hydra Charteris Base: Hell's Heaven`. The card also shows the mode, but the button name is only the map name.
- Search matches the name and the mode, and it ignores apostrophes. `hells` still finds `Hydra Charteris Base: Hell's Heaven`.
- `Close map picker` and Escape leave the current map in place. Choosing a card closes the picker and changes the map.
- A chosen map is a board edit. `Undo` returns the previous map, including a custom image that was current before the switch.
- Custom images last for this page session only. Reload removes them. The uploaded map's heading is the file name, including `.png`.
- `Upload image` accepts PNG, JPEG, WebP, and GIF. The visible alert for another type is `Choose a PNG, JPEG, WebP, or GIF image.`
- Files over 10 MiB, images over 24 million pixels, or totals over 50 MiB or 80 million pixels in this tab are rejected with their own alert. Reload starts the totals over.
- A custom board image does not appear in the Draft / Comp Builder map list.
