# Rivals Lab

Use Node.js 22.13.0 or later. Install dependencies with `npm ci`.

## Development

- `npm run dev`: start the development server.
- `npm run check`: check TypeScript types.
- `npm run build`: create the production build.
- `npm test`: run browser tests. See [test setup](tests/README.md).

## Formatting

- `npm run format`: format supported project files with Prettier.
- `npm run format:check`: check formatting without changing files.

The project uses the default Prettier rules in `.prettierrc.json`.
Dependencies, build output, coverage, and generated test reports are excluded
through `.prettierignore`.

Before a pull request, run `npm run format:check`, `npm run check`, and
`npm run build`.
