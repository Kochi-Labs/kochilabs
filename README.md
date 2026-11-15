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

The signature heading uses the locally hosted Birthstone font from Google Fonts. Its SIL Open Font License is included in `public/fonts/OFL-Birthstone.txt`. The game includes scrolling ground, clouds, and an animated crow. The painted Kerala background is layered with an interactive Three.js scene.

## Scene interactions

- In daylight, the sun casts a warm disc and shimmering light path onto the water. Click-generated waves distort both the sun and moon reflections; switching day/night smoothly blends between them.

- At night, fireflies drift and glow near the banks. The crescent moon and its broken light path reflect on the water through the same wave displacement used by water clicks. Reduced motion stops firefly drifting and pulsing.

- Double-click the illustrated sun to turn it into a crescent moon and enter night: a starry sky, moonlit scenery, warm boat and metro windows, and a light-colored game. Double-click the moon to restore daylight. Double-tap works on touch screens; Enter or Space works with the sun/moon focused.

- Click the water to send out waves and float a lotus. The boat responds to wave heights sampled beneath its bow and stern.
- Drag the houseboat horizontally; release it to let its momentum settle. Tap it for a gentle rocking motion.
- The illustrated metro runs across its viaduct. Tap it for a temporary speed boost.
- Click the headline to release birds and rock the boat.
- Scroll to shift the landscape, bridge, and boat at different depths.
- Focus the scene and press Enter to make a splash. Space still starts the dinosaur game.
- The score toggles between the current run and your saved best score.

`src/lib/kerala-scene.ts` owns the Three.js renderer and interactions. `src/lib/scene-models.ts` contains the illustrated geometry. `src/lib/water-physics.ts` contains travelling-wave sampling and damped spring integration. This is a lightweight wave and buoyancy simulation, not a full fluid solver. Fixed timesteps, capped pixel ratio, bounded effects, background-tab pausing, and resource cleanup keep the scene manageable. Reduced-motion preferences stop ambient water and train motion and soften direct interactions. A static image remains available if WebGL cannot start.

The background and its boat-free edit were created with built-in ImageGen. The image assets and exact generation prompts are stored in `public/images/`. The original painting is preserved; `kerala-backwaters-clean.png` is the background plate for the animated scene.
