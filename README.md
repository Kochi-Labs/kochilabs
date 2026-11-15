# Kochi Raps

A minimal Astro holding page: “Kochi Raps is cooking something.” Includes an original Chrome-inspired dinosaur runner with keyboard and touch controls. The page uses a black background and vibrant yellow, with only the headline and game score visible.

## Development

```sh
npm install
npm run dev
```

Open the local URL printed by Astro. A project-local Node 22 runtime is installed so npm scripts satisfy Astro's runtime requirement without changing your system Node installation.

## Validation and production

```sh
npm run check
npm run build
npm run preview
```

The production site is generated in `dist/` and can be deployed to a static host. The page and game use no remote fonts, images, or APIs. The game is available while online too; this is not an offline caching/PWA implementation.

## Editing

- `src/pages/index.astro`: page content, layout, and styles.
- `src/components/DinoGame.astro`: runner and controls.
- `public/favicon.svg`: brand mark.

Use the play icon to start, then Space, Arrow Up, or tap to jump. The pause icon or Escape pauses the game. The current score is shown above the game.
