# Render check iterations

1. First five-shape run: no browser errors and motion passed, but lens, F1, and the main-page midpoint were slightly below 2% coverage (1.85%, 1.87%, and 1.48%).
2. Expanded the SVG/placeholder bounds and dust field: coverage improved, but lens and F1 remained just under the floor (1.88%, 1.92%).
3. Raised typical point sizes while keeping ordinary particles hard-clamped to 3px and the 3% sparkle subset capped at 5px. Final five-shape run passed: demo saturation face 0.48%, tower 1.53%, lens 1.47%, F1 2.18%, dust 0.85%; coverage face 9.39%, tower 6.62%, lens 4.98%, F1 4.36%, dust 9.43%. Main-page coverage was 9.04%, 5.18%, 2.06%, and 2.80% at scroll 0%, 25%, 50%, and 75%. No console/page errors; frames one second apart differed by 16.07%. Screenshots are in ignored `debug/`.
