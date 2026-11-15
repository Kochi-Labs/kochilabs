# Kochi Labs

A minimal Astro holding page: “God’s own country is cooking something.” Includes an original Chrome-inspired dinosaur runner with keyboard and touch controls. The page uses an original anime-inspired Kerala backwaters background and black text and game graphics, with only the headline and game score visible.

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

Press Space anywhere on the page or tap the game to start or restart. Press Space, Arrow Up, or tap to jump. The pause icon or Escape pauses the game. A restart icon appears after a collision; Space and tapping the game also restart it. The current score is shown above the game.

The signature heading uses the locally hosted Birthstone font from Google Fonts. Its SIL Open Font License is included in `public/fonts/OFL-Birthstone.txt`. The game includes scrolling ground, clouds, and an animated crow. The background illustration is static.

## Scene interactions

Move the pointer for subtle scenery movement. Click the headline or sky to release birds, and click the water to create a ripple. The score toggles between the current run and your saved best score. Reduced-motion preferences disable scenery movement and moving effects.

The original background was created with the built-in ImageGen tool. The asset and generation prompt are in `public/images/kerala-backwaters.png` and `public/images/kerala-backwaters-prompt.txt`.
