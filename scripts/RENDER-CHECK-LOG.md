# Render check iterations

1. Initial harness attempt stopped before capture: Playwright requires screenshot paths as strings; changed URL objects to `fileURLToPath()`.
2. First capture: engine and animation rendered, but the offline Google Fonts request logged a console error; demo coverage was 1.24–1.97% and some main-page captures were below 2%. Stubbed the remote font CSS in the harness and increased emitted RGB brightness while keeping shader alpha capped at 0.5.
3. Second capture: no browser errors and motion differed by 2.42%, but demo midpoint/main coverage still ranged 0.68–1.89%. Raised the depth attenuation numerator from 2.8 to 4.5 and increased base sizes; normal points remain clamped at 3px, with 3% sparkle points up to 5px.
4. Final capture: no console/page errors; all saturation values are below 0.8%, all coverage values are 2.12–6.96%, and frames one second apart differ by 3.49% of pixels. See `debug/` for the PNG captures (ignored by Git).
