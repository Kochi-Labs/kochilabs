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

- Brush the painted palms and shoreline trees to bend their foliage toward your pointer. Shake a palm sideways to drop a coconut; tapping a palm also gives it a shake. The coconut falls under gravity, scales with its distance from the viewer, splashes into the water, and floats with the wave surface.
- Click any of the twelve village houses to swing its window shutters open and switch on warm interior lights. Click again to close them. Nightfall automatically opens and lights every house. Night clicks can override an individual house for that night; daylight restores its previous daytime state. Automatic night lighting keeps villagers indoors. A tiny villager emerges and walks toward the shore when a house opens, and returns when it closes. Keyboard users can Tab to the individual house controls and the palm-shake control; these controls become visible on focus.

- Clouds drift inside a spatially masked clear-sky region; both source and destination exclude palms and shoreline trees, preventing moving foliage outlines. The narrow cloud fringe next to the trees stays fixed. Reduced motion keeps the original sky static.

- In daylight, the sun casts a warm disc and shimmering light path onto the water. Click-generated waves distort both the sun and moon reflections; switching day/night smoothly blends between them.

- At night, fireflies drift and glow near the banks. The crescent moon and its broken light path reflect on the water through the same wave displacement used by water clicks. Reduced motion stops firefly drifting and pulsing.

- Double-click the illustrated sun to turn it into a crescent moon and enter night: a starry sky, moonlit scenery, warm boat and metro windows, and a light-colored game. Double-click the moon to restore daylight. Double-tap works on touch screens; Enter or Space works with the sun/moon focused.

- Click the water to send out waves and float a lotus. The boat responds to wave heights sampled beneath its bow and stern.
- Drag the houseboat horizontally; release it to let its momentum settle. Tap it for a gentle rocking motion.
- The original cream-and-teal illustrated metro runs along its simple concrete viaduct and pillars. Click any carriage once to ignite the last (leftmost) carriage; the other two remain intact. Rain arrives, extinguishes the fire, and leaves steam and rear-carriage damage.
- The headline cycles through English, Spanish, French, German, and Hindi every eight seconds. Click to change immediately. Hover, keyboard focus, and hidden tabs pause the cycle; reduced-motion mode uses manual switching. Hindi uses locally bundled Noto Serif Devanagari, with its SIL Open Font License in `public/fonts/`.
- A small corked glass bottle drifts in the backwaters, sharing the boat's wave heights and slope. Click it (or use its keyboard shortcut while present) to open the textured palm-leaf message in the current headline language. Its spiral ends physically unwind and roll back up when closed. The bottle first appears after three seconds and returns after being opened. Close the message with its button, Escape, or a click outside it. Reduced motion holds the bottle still and opens/closes the leaf immediately. `message-bottle.ts` owns the floating model; `bottle-note.ts` coordinates the accessible dialog; `palm-leaf-scroll.ts` owns the manuscript.
- Scroll to shift the landscape, bridge, and boat at different depths.
- Focus the scene and press Enter to make a splash. Space still starts the dinosaur game.
- The score toggles between the current run and your saved best score.

`src/lib/kerala-scene.ts` owns the Three.js renderer and interactions. `src/lib/scene-models.ts` contains the illustrated geometry. `src/lib/water-physics.ts` contains travelling-wave sampling and damped spring integration. `src/lib/living-foliage.ts` animates the painted foliage with localized shader deformation, spring responses, and coconut motion; `src/lib/village-houses.ts` aligns hinged window overlays with the original buildings. `src/lib/river-surface.ts` renders a separate tessellated, lit river surface bounded by the shoreline. Waves use a depth-dependent perspective transform, with smaller ripples and lower projected height farther away. This is a lightweight wave and buoyancy simulation, not a full fluid solver. Fixed timesteps, capped pixel ratio, bounded effects, background-tab pausing, and resource cleanup keep the scene manageable. Reduced-motion preferences stop ambient water and train motion and soften direct interactions. A static image remains available if WebGL cannot start.

The background and its boat-free edit were created with built-in ImageGen. The image assets and exact generation prompts are stored in `public/images/`. The original painting is preserved; `kerala-backwaters-clean.png` is the background plate for the animated scene.

The restored rolling wave style drives the boat’s five hull samples and coconut slope samples. The houseboat keeps the original traditional kettuvallam shape: upswept wooden hull, rounded woven roof, arched cabin windows, and an open veranda. A lightly weathered seafoam hull, honey cabin, ivory woven roof, and warm timber trim brighten the original design. Lit materials add wood grain, woven detail, glass highlights, and warm night lighting. A separate render target captures the actual boat and lighting for a water reflection distorted by the shared wave field; soft contact shading and a movement wake anchor it to the river. `luxury-houseboat.ts` owns its model and lights; `boat-water.ts` owns its reflection and water contact.

Click any metro carriage once to ignite only the last carriage. Rain arrives after five seconds and extinguishes its flames by twelve seconds, followed by cooling steam. Scorch marks, warped panels, and cracked windows remain until the train leaves the screen. Another click after the sequence replays it. The dragon is removed. This is a real-time visual simulation, not a photorealistic fluid or structural simulation.

## Soundscape

The logo demo has been removed. A small speaker control enables or mutes an original, synthesized handpan-style melody and gentle material sounds for water, the houseboat, palms, windows, coconuts, birds, the bottle and leaf note, and the dinosaur game. Rain and fire have quiet ambient beds. All audio is generated locally with Web Audio; no recordings or remote audio assets are required.

Audio begins with the first pointer or supported keyboard interaction. Muting is remembered, hidden tabs suspend audio, and returning requires another interaction to resume. `src/lib/soundscape.ts` owns synthesis, mixing, effect throttling, and cleanup.
