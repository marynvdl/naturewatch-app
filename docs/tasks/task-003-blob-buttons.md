# Task 003 — Blob buttons

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 003-map-controls has merged.

## Goal

Replace the existing map panel toggle buttons with three large, irregular, organic blob buttons. They open and close the existing Places, Layers, and Measure panels. The map stays the main visual focus.

The motion is closed, then a brief squash, then open. Reference: [task-003-blob-states.png](task-003-blob-states.png). The animation should feel soft, calm, and physically satisfying, like the gentle breathing of a Headspace illustration.

## Do this

Check with me to approve design and layout.

Inspect the current Vue components, map layout, styling, and open/close state before changing them. Reuse that state. Do not remount the map.

Create a reusable `BlobButton` component.

- **Closed.** Three floating buttons: Places on the left, Layers on the right, Measure at the bottom. Smooth irregular outlines, not perfect circles. Each button has a recognizable icon. Idle motion is an extremely subtle, slow breathing deformation.
- **Hover.** A slight organic deformation and a very small movement towards the pointer. No bouncing, rotation, or large scaling.
- **Opening.** The blob briefly compresses, then expands and spreads towards its panel. The motion is soft and elastic, with a small settle. The existing panel appears smoothly over the expanded blob. The transition is continuous: no jump in shape or position.
- **Open.** The existing panel sits on a solid warm off-white surface, `--panel-surface`. Keep the current panel contents, controls, and behaviour. Part of the blob stays visible behind the panel and remains the close control.
- **Closing.** Clicking the exposed blob reverses the morph and returns the button to its floating position and size. Rapid open and close stays smooth.

Use SVG for the blob contours, CSS for simple movement, and JavaScript only for morphing and interaction. Use tokens from `visual.css`. Keep animation styles scoped to the component. Expose named parameters for blob size, colour, hover response, breathing intensity, and transition duration.

The app uses Mapbox, not MapLibre. Keep the animation light beside the map: prefer CSS `transform` and `opacity`, avoid blur filters and continuous SVG path recalculation, and pause or simplify the idle motion when it is not needed. Support `prefers-reduced-motion`. The controls are keyboard accessible, with labels, focus indicators, and expanded state. Touch targets stay reliable. On a narrow screen the buttons and panels do not overlap.

Preserve existing Vuetify components and the Tailwind setup. Do not add unprefixed Tailwind utilities that conflict with Vuetify. Do not add Rive, GSAP, or another animation library unless there is a clear technical reason. If one seems necessary, explain it and stop before adding it.

Use the current Sooty Earth language: Roboto, Baskerville, restrained colours, minimal shadows, and light surfaces.

## Do not

- Do not redesign the contents of the Places, Layers, or Measure panels.
- Do not change what those panels do.
- Do not start task 004.

## Done when

- The three buttons open and close the existing panels with the morph described above.
- The map stays mounted through the transition.
- Keyboard, reduced motion, and a narrow screen have been checked in the browser.
- Relevant local tests have been run, and the results are reported.
- The summary names the files changed and the parameters that tune size, colour, hover, breathing, and duration.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it. Do not wait for remote CI after pushing.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
