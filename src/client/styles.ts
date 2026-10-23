/**
 * Shared tavern panel styles: the creation-page card and the session toolbox
 * both render these classes, so they live in one module.
 *
 * Values follow the DSH Web styling rules: weights top out at 500, radii come
 * from the shared `--dsw-radius-*` scale, elevated surfaces use
 * `--dsw-elevation-*` instead of a hand-built shadow, and neutral solid strokes
 * draw at 0.5px. Only sizes, spacing, and type scale with `--tv-scale`; radii
 * and strokes stay at their token values so the geometry does not drift on
 * large displays.
 */
export const PANEL_CSS = `
/* Tokens are declared on both the panel and the pre-chat card: the card renders
   in the conversation dock, outside the panel, so panel-only variables would
   leave every calc() in it unresolved. The turn-tail regeneration row is in the
   conversation too, for the same reason. */
.dshtavern-panel,
.dshtavern-greeting,
.dshtavern-regenerate-row {
  --tv-scale: 1;
  --tv-fs-body: calc(13.5px * var(--tv-scale));
  --tv-fs-small: calc(11.5px * var(--tv-scale));
  --tv-fs-title: calc(22px * var(--tv-scale));
  --tv-fs-section: calc(14px * var(--tv-scale));
  --tv-fs-name: calc(13.5px * var(--tv-scale));
  --tv-fs-button: calc(12.5px * var(--tv-scale));
  --tv-gap: calc(14px * var(--tv-scale));
  --tv-pad: calc(18px * var(--tv-scale));
  --tv-radius-sm: var(--dsw-radius-sm, 8px);
  --tv-radius-md: var(--dsw-radius-md, 12px);
  --tv-radius-lg: var(--dsw-radius-lg, 16px);
  --tv-radius-xl: var(--dsw-radius-xl, 20px);
  --tv-radius-panel: var(--dsw-radius-panel, 28px);
  --tv-hairline: 0.5px;
  /* brand-primary resolves to ink in the shipped theme, so fills and accents
     read the business-blue state token instead. */
  --tv-accent: var(--dsw-alias-state-business-primary, #4f7fe0);
}
.dshtavern-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: calc(24px * var(--tv-scale)) calc(24px * var(--tv-scale)) calc(32px * var(--tv-scale));
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, system-ui, sans-serif);
}
@media (min-width: 1280px) { .dshtavern-panel, .dshtavern-greeting, .dshtavern-regenerate-row { --tv-scale: 1.05; } }
@media (min-width: 1600px) { .dshtavern-panel, .dshtavern-greeting, .dshtavern-regenerate-row { --tv-scale: 1.12; } }
@media (min-width: 1920px) { .dshtavern-panel, .dshtavern-greeting, .dshtavern-regenerate-row { --tv-scale: 1.18; } }
@media (min-width: 2300px) { .dshtavern-panel, .dshtavern-greeting, .dshtavern-regenerate-row { --tv-scale: 1.25; } }
@media (min-width: 2560px) { .dshtavern-panel, .dshtavern-greeting, .dshtavern-regenerate-row { --tv-scale: 1.32; } }
.dshtavern-panel * { box-sizing: border-box; }
.dshtavern-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: min(100%, calc(1240px * var(--tv-scale)));
  margin: 0 auto;
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-panel);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.dshtavern-card-head {
  display: flex;
  align-items: flex-start;
  gap: var(--tv-gap);
  padding: calc(20px * var(--tv-scale)) var(--tv-pad) calc(16px * var(--tv-scale));
}
.dshtavern-head-main { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.dshtavern-head-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dshtavern-header-title { font-size: var(--tv-fs-title); font-weight: 500; line-height: 1.3; letter-spacing: -0.01em; }
.dshtavern-subtitle { font-size: var(--tv-fs-small); line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.dshtavern-meta { font-size: var(--tv-fs-small); line-height: 1.6; color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.dshtavern-card-banners {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--tv-scale));
  padding: 0 var(--tv-pad) calc(12px * var(--tv-scale));
}
.dshtavern-card-body { display: flex; flex-direction: column; border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1); }
.dshtavern-pane {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--tv-scale));
  padding: var(--tv-pad);
  min-width: 0;
}
.dshtavern-pane + .dshtavern-pane { border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1); }
@media (min-width: 1120px) {
  .dshtavern-card-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(calc(360px * var(--tv-scale)), calc(420px * var(--tv-scale)));
  }
  .dshtavern-pane + .dshtavern-pane { border-top: none; border-left: var(--tv-hairline) solid var(--dsw-alias-border-l1); }
}
.dshtavern-group { display: flex; flex-direction: column; gap: calc(10px * var(--tv-scale)); }
.dshtavern-group + .dshtavern-group {
  margin-top: calc(18px * var(--tv-scale));
  padding-top: calc(18px * var(--tv-scale));
  border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-card-foot { padding: calc(12px * var(--tv-scale)) var(--tv-pad); border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1); }
.dshtavern-section-title {
  display: flex;
  align-items: baseline;
  gap: calc(8px * var(--tv-scale));
  font-size: var(--tv-fs-section);
  font-weight: 500;
  line-height: 1.4;
}
.dshtavern-count { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
/* Rows bleed by a fixed 8px so the hover fill reads as a full-width row while
   staying inside both a pane's and a group's padding. */
.dshtavern-row {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--tv-scale));
  margin-inline: -8px;
  padding: calc(10px * var(--tv-scale)) 8px;
  border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
}
.dshtavern-row:first-child { border-top: none; }
.dshtavern-row-main { display: flex; flex-direction: column; gap: calc(3px * var(--tv-scale)); flex: 1; min-width: 0; }
.dshtavern-name { font-size: var(--tv-fs-name); font-weight: 500; line-height: 1.4; }
.dshtavern-path {
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--tv-fs-small);
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.dshtavern-input {
  width: 100%;
  padding: calc(7px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: var(--tv-fs-body);
  font-family: inherit;
  outline: none;
}
.dshtavern-input:focus { border-color: var(--tv-accent); }
.dshtavern-input::placeholder { color: var(--dsw-alias-label-secondary); }
.dshtavern-button {
  padding: calc(6px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l2);
  border-radius: var(--tv-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: var(--tv-fs-button);
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.dshtavern-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
}
.dshtavern-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--tv-accent);
  outline-offset: 2px;
}
.dshtavern-button:disabled { color: var(--dsw-alias-label-secondary); cursor: default; opacity: 0.55; }
.dshtavern-button-primary {
  border-color: var(--tv-accent);
  background: var(--tv-accent);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dshtavern-button-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tv-accent) 86%, #000);
  border-color: var(--tv-accent);
}
.dshtavern-button-danger {
  color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);
}
.dshtavern-button-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border-color: var(--dsw-alias-state-error-primary);
}
.dshtavern-banner {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--tv-scale));
  padding: calc(8px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border-radius: var(--tv-radius-sm);
  font-size: var(--tv-fs-small);
  line-height: 1.5;
}
.dshtavern-banner-error {
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.dshtavern-banner-notice {
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent);
  color: var(--dsw-alias-state-success-primary);
}
.dshtavern-banner-action { margin-left: auto; }
.dshtavern-form { display: flex; flex-direction: column; gap: calc(10px * var(--tv-scale)); }
.dshtavern-field { display: flex; flex-direction: column; gap: calc(5px * var(--tv-scale)); }
.dshtavern-label { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }
.dshtavern-form-actions { display: flex; justify-content: flex-end; gap: calc(8px * var(--tv-scale)); padding-top: calc(2px * var(--tv-scale)); }
.dshtavern-hint { font-size: var(--tv-fs-small); line-height: 1.6; color: var(--dsw-alias-label-secondary); }
@keyframes dshtavern-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@keyframes dshtavern-rise-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}
@keyframes dshtavern-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes dshtavern-pulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
.dshtavern-card { animation: dshtavern-card-in 240ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.dshtavern-banner { animation: dshtavern-rise-in 180ms ease-out both; }
.dshtavern-row { animation: dshtavern-fade-in 200ms ease-out both; transition: background 150ms ease; }
.dshtavern-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshtavern-button { transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease; }
.dshtavern-button:active:not(:disabled) { transform: translateY(1px); }
.dshtavern-button-pulse { animation: dshtavern-pulse 1.2s ease-in-out infinite; }
.dshtavern-input { transition: border-color 150ms ease, box-shadow 150ms ease; }
.dshtavern-input:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--tv-accent) 18%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .dshtavern-card, .dshtavern-banner, .dshtavern-row, .dshtavern-button-pulse { animation: none !important; }
  .dshtavern-row, .dshtavern-button, .dshtavern-input { transition: none !important; }
  .dshtavern-button:active:not(:disabled) { transform: none; }
}
.dshtavern-tabs {
  display: flex;
  gap: 4px;
  padding: 0 var(--tv-pad);
  border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-tab {
  padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-body);
  font-family: inherit;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.dshtavern-tab:hover { color: var(--dsw-alias-label-primary); }
.dshtavern-tab-active {
  color: var(--tv-accent);
  border-bottom-color: var(--tv-accent);
}
.dshtavern-row { cursor: pointer; }
.dshtavern-row-selected { background: color-mix(in srgb, var(--tv-accent) 10%, transparent); }
.dshtavern-prompt-head { display: flex; align-items: flex-start; gap: var(--tv-gap); }
.dshtavern-prompt-list { display: flex; flex-direction: column; gap: calc(6px * var(--tv-scale)); }
.dshtavern-prompt-card {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--tv-scale));
  width: 100%;
  min-width: 0;
  padding: calc(8px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  cursor: grab;
  animation: dshtavern-fade-in 180ms ease-out both;
  transition: border-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease, background-color 150ms ease;
}
.dshtavern-prompt-card:hover { border-color: var(--dsw-alias-border-l3); }
.dshtavern-prompt-card-off {
  background: var(--dsw-alias-bg-layer-1);
  border-style: dashed;
}
.dshtavern-prompt-card-off .dshtavern-prompt-name { color: var(--dsw-alias-label-secondary); }
.dshtavern-prompt-card-off .dshtavern-hint { opacity: 0.7; }
.dshtavern-prompt-card-dragging { opacity: 0.45; cursor: grabbing; }
.dshtavern-prompt-card-over {
  border-color: var(--tv-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tv-accent) 35%, transparent);
}
.dshtavern-drag-handle { color: var(--dsw-alias-label-secondary); font-size: calc(14px * var(--tv-scale)); line-height: 1; user-select: none; opacity: 0.45; }
.dshtavern-prompt-card:hover .dshtavern-drag-handle { opacity: 0.9; }
.dshtavern-prompt-index {
  display: grid;
  place-items: center;
  flex: none;
  width: calc(20px * var(--tv-scale));
  height: calc(20px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: calc(10px * var(--tv-scale));
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.dshtavern-prompt-main { display: flex; flex-direction: column; gap: calc(1px * var(--tv-scale)); flex: 1; min-width: 0; }
.dshtavern-prompt-title { display: flex; align-items: center; gap: calc(7px * var(--tv-scale)); min-width: 0; }
.dshtavern-prompt-name { font-size: var(--tv-fs-name); font-weight: 500; line-height: 1.4; }
.dshtavern-prompt-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(10px * var(--tv-scale));
  flex: none;
  min-width: calc(96px * var(--tv-scale));
}
.dshtavern-prompt-chars {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.8;
}
.dshtavern-prompt-edit {
  padding: 0 calc(8px * var(--tv-scale));
  height: calc(22px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: var(--tv-fs-small);
  line-height: 1;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
}
.dshtavern-prompt-edit:hover {
  color: var(--tv-accent);
  border-color: color-mix(in srgb, var(--tv-accent) 45%, transparent);
  background: color-mix(in srgb, var(--tv-accent) 10%, transparent);
}
.dshtavern-prompt-edit:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--tv-accent); outline-offset: 2px; }
.dshtavern-prompt-meta { display: flex; align-items: center; gap: calc(8px * var(--tv-scale)); flex-wrap: wrap; }
.dshtavern-prompt-card .dshtavern-hint,
.dshtavern-prompt-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-badge {
  font-size: var(--tv-fs-small);
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  corner-shape: round;
  padding: 0 calc(7px * var(--tv-scale));
  white-space: nowrap;
}
.dshtavern-badge[data-source='template'] {
  color: var(--tv-accent);
  border-color: color-mix(in srgb, var(--tv-accent) 40%, transparent);
  background: color-mix(in srgb, var(--tv-accent) 10%, transparent);
}
.dshtavern-badge[data-source='character'] {
  color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}
.dshtavern-badge[data-source='worldbook'] {
  color: var(--dsw-alias-state-warn-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);
}
.dshtavern-badge[data-source='persona'],
.dshtavern-badge[data-source='chat'],
.dshtavern-badge[data-source='dsh'] {
  color: var(--dsw-alias-label-secondary);
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.dshtavern-save-status { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dshtavern-toggle {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--tv-scale));
  font-size: var(--tv-fs-small);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  user-select: none;
}
.dshtavern-toggle input { accent-color: var(--tv-accent); cursor: pointer; }
.dshtavern-mode-picker { display: flex; gap: calc(10px * var(--tv-scale)); flex-wrap: wrap; }
.dshtavern-mode-option {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: calc(11px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.dshtavern-mode-option:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3); }
.dshtavern-mode-option:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: 2px; }
.dshtavern-mode-option[data-active='true'] {
  border-color: var(--tv-accent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
}
.dshtavern-mode-option:disabled { opacity: 0.6; cursor: default; }
.dshtavern-mode-name { font-size: var(--tv-fs-body); font-weight: 500; }
.dshtavern-mode-desc { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); line-height: 1.5; }
@media (prefers-reduced-motion: reduce) {
  .dshtavern-prompt-card { animation: none !important; transition: none !important; }
}
/* Pre-chat opening line: shown above the composer while a tavern chat is blank. */
.dshtavern-greeting {
  width: 100%;
  max-width: calc(720px * var(--tv-scale));
  margin: 0 auto calc(10px * var(--tv-scale));
  padding: calc(14px * var(--tv-scale)) calc(16px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: var(--dsw-alias-bg-layer-2);
  box-sizing: border-box;
}
.dshtavern-greeting-head {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--tv-scale));
  margin-bottom: calc(10px * var(--tv-scale));
}
.dshtavern-greeting-avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: calc(28px * var(--tv-scale));
  height: calc(28px * var(--tv-scale));
  border-radius: 8px;
  background: color-mix(in srgb, var(--tv-accent, #4f7fe0) 16%, transparent);
  color: var(--tv-accent, #4f7fe0);
  font-size: var(--tv-fs-small);
  font-weight: 600;
}
.dshtavern-greeting-title { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dshtavern-greeting-name { font-size: var(--tv-fs-body); font-weight: 500; }
.dshtavern-greeting-hint { color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); }
.dshtavern-greeting-text {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--tv-fs-body);
  line-height: 1.75;
  white-space: pre-wrap;
}
/* Scene setting: reads as narration, so it is quoted like one. */
.dshtavern-opening-narration {
  margin: 0 0 calc(12px * var(--tv-scale));
  padding-inline-start: calc(10px * var(--tv-scale));
  border-inline-start: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-body);
  line-height: 1.75;
  white-space: pre-wrap;
}
.dshtavern-opening-narration:last-child { margin-bottom: 0; }
.dshtavern-opening-speech {
  margin-top: calc(12px * var(--tv-scale));
  padding-top: calc(12px * var(--tv-scale));
  border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
/* A consecutive line from the same speaker continues the bubble: no rule. */
.dshtavern-opening-speech[data-continued='true'] {
  margin-top: calc(6px * var(--tv-scale));
  padding-top: 0;
  border-top: 0;
}
.dshtavern-opening-speech[data-continued='true'] .dshtavern-greeting-head {
  margin-bottom: calc(6px * var(--tv-scale));
}
.dshtavern-opening-foot {
  margin-top: calc(12px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  text-align: right;
}
/* Generating state: a model call is running, so say so rather than show a
   blank pane under the hero. */
.dshtavern-greeting-loading {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--tv-scale));
}
.dshtavern-opening-spinner {
  flex: none;
  width: calc(18px * var(--tv-scale));
  height: calc(18px * var(--tv-scale));
  box-sizing: border-box;
  border: calc(2px * var(--tv-scale)) solid color-mix(in srgb, var(--tv-accent) 22%, transparent);
  border-top-color: var(--tv-accent);
  border-radius: 50%;
  animation: dshtavern-spin 720ms linear infinite;
}
@keyframes dshtavern-spin {
  to { transform: rotate(360deg); }
}
.dshtavern-opening-loading-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dshtavern-opening-loading-title { font-size: var(--tv-fs-body); font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshtavern-opening-loading-hint { font-size: var(--tv-fs-small); line-height: 1.5; color: var(--dsw-alias-label-secondary); }
@media (prefers-reduced-motion: reduce) {
  .dshtavern-opening-spinner { animation: none; border-top-color: color-mix(in srgb, var(--tv-accent) 60%, transparent); }
}
/* Regeneration sits in the turn-tail action row, next to the shipped message
   actions. It must read as a quiet secondary control, not a primary CTA. */
.dshtavern-regenerate-row {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--tv-scale));
  min-width: 0;
}
.dshtavern-regenerate-action {
  padding: calc(3px * var(--tv-scale)) calc(9px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  font-family: inherit;
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.dshtavern-regenerate-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.dshtavern-regenerate-action:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--tv-accent);
  outline-offset: 2px;
}
.dshtavern-regenerate-action:disabled { cursor: default; opacity: 0.6; }
.dshtavern-regenerate-superseded {
  font-size: var(--tv-fs-small);
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
.dshtavern-regenerate-error { font-size: var(--tv-fs-small); line-height: 1.5; color: var(--dsw-alias-state-error-primary); }
`

/** Shared class names; every rule is prefixed with `dshtavern-`. */
export const CLASS = {
  panel: 'dshtavern-panel',
  card: 'dshtavern-card',
  cardHead: 'dshtavern-card-head',
  headMain: 'dshtavern-head-main',
  headSide: 'dshtavern-head-side',
  title: 'dshtavern-header-title',
  subtitle: 'dshtavern-subtitle',
  meta: 'dshtavern-meta',
  banners: 'dshtavern-card-banners',
  cardBody: 'dshtavern-card-body',
  pane: 'dshtavern-pane',
  group: 'dshtavern-group',
  cardFoot: 'dshtavern-card-foot',
  sectionTitle: 'dshtavern-section-title',
  count: 'dshtavern-count',
  row: 'dshtavern-row',
  rowMain: 'dshtavern-row-main',
  name: 'dshtavern-name',
  path: 'dshtavern-path',
  input: 'dshtavern-input',
  button: 'dshtavern-button',
  buttonPulse: 'dshtavern-button dshtavern-button-pulse',
  buttonPrimary: 'dshtavern-button dshtavern-button-primary',
  buttonDanger: 'dshtavern-button dshtavern-button-danger',
  banner: 'dshtavern-banner',
  bannerError: 'dshtavern-banner dshtavern-banner-error',
  bannerNotice: 'dshtavern-banner dshtavern-banner-notice',
  bannerAction: 'dshtavern-banner-action',
  form: 'dshtavern-form',
  field: 'dshtavern-field',
  label: 'dshtavern-label',
  formActions: 'dshtavern-form-actions',
  hint: 'dshtavern-hint',
  tabs: 'dshtavern-tabs',
  tab: 'dshtavern-tab',
  tabActive: 'dshtavern-tab dshtavern-tab-active',
  promptHead: 'dshtavern-prompt-head',
  promptList: 'dshtavern-prompt-list',
  promptCard: 'dshtavern-prompt-card',
  promptCardDragging: 'dshtavern-prompt-card dshtavern-prompt-card-dragging',
  promptCardOver: 'dshtavern-prompt-card dshtavern-prompt-card-over',
  promptIndex: 'dshtavern-prompt-index',
  promptMain: 'dshtavern-prompt-main',
  promptName: 'dshtavern-prompt-name',
  promptMeta: 'dshtavern-prompt-meta',
  dragHandle: 'dshtavern-drag-handle',
  badge: 'dshtavern-badge',
  saveStatus: 'dshtavern-save-status',
  toggle: 'dshtavern-toggle',
  rowSelected: 'dshtavern-row dshtavern-row-selected',
} as const

/**
 * Story styles: narration versus speech inside a tavern conversation.
 *
 * Every rule is scoped to `body[data-dshtavern-story]`, which the toolbox
 * detector sets only while a tavern session is on screen, so an ordinary
 * coding conversation keeps its normal markdown.
 *
 * The orchestrator emits narration as a blockquote and speech as a bold
 * speaker name, so these rules restyle existing elements rather than adding
 * new markup inside the conversation.
 */
export const STORY_CSS = `
body[data-dshtavern-story] .dshtavern-story blockquote,
body[data-dshtavern-story] blockquote {
  position: relative;
  margin: 14px 0;
  padding: 10px 14px 10px 16px;
  border-left: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f7fe0) 55%, transparent);
  border-radius: 0 var(--dsw-radius-sm, 8px) var(--dsw-radius-sm, 8px) 0;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f7fe0) 5%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-style: normal;
}
body[data-dshtavern-story] blockquote p {
  margin: 0;
  font-style: italic;
  line-height: 1.85;
}
body[data-dshtavern-story] blockquote p + p { margin-top: 8px; }

/* ---- Speech bubble -------------------------------------------------------
 * A character's turn is a quote whose first paragraph is the name, which is
 * what tells it apart from narration (narration never carries a bold-only
 * paragraph). Layout: a bubble hugging its content, with the name as a small
 * label, actions muted, and dialogue at normal weight so the spoken line is
 * what the eye lands on. */
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: fit-content;
  max-width: min(100%, calc(640px * var(--tv-scale, 1)));
  margin: 12px 0;
  padding: 10px 14px 11px;
  border: var(--tv-hairline, 0.5px) solid var(--dsw-alias-border-l1);
  border-left: var(--tv-hairline, 0.5px) solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 16px) var(--dsw-radius-lg, 16px) var(--dsw-radius-lg, 16px) 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) > p {
  font-style: normal;
  line-height: 1.75;
}
/* Name label. */
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) > p:first-child {
  margin: 0 0 2px;
  font-size: calc(12.5px * var(--tv-scale, 1));
  line-height: 1.4;
}
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) > p:first-child strong {
  color: var(--dsw-alias-state-business-primary, #4f7fe0);
  font-size: inherit;
  font-weight: 500;
  letter-spacing: 0.01em;
}
/* Action: stage direction inside the bubble, quieter than the line spoken. */
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) > p:has(> em:only-child) {
  color: var(--dsw-alias-label-secondary);
  font-style: italic;
  font-size: 0.95em;
}
body[data-dshtavern-story] blockquote:has(> p:first-child > strong:only-child) > p:has(> em:only-child) + p {
  margin-top: 4px;
}
/* Breathing room between consecutive story blocks. */
body[data-dshtavern-story] blockquote + blockquote { margin-top: 14px; }
.dshtavern-wb-panel { display: flex; flex-direction: row; flex: 1; min-height: 0; overflow: hidden; }
.dshtavern-wb-sidebar { display:flex; flex-direction:column; gap: calc(8px * var(--tv-scale)); flex-shrink:0; width: calc(230px * var(--tv-scale)); padding: calc(14px * var(--tv-scale)) calc(12px * var(--tv-scale)); border-right: var(--tv-hairline) solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent); overflow:auto; }
/* Side header: title row keeps its width, actions get their own row so adding
 * buttons never crushes the heading to zero width. */
.dshtavern-wb-side-head {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--tv-scale));
  padding-bottom: calc(10px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-wb-side-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dshtavern-wb-side-actions { display: flex; gap: calc(6px * var(--tv-scale)); }
.dshtavern-wb-side-actions .dshtavern-button { flex: 1 1 0; min-width: 0; }
.dshtavern-wb-heading { flex:1; min-width:0; font-size: var(--tv-fs-section); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshtavern-wb-count { flex: none; min-width:20px; padding:0 6px; border: var(--tv-hairline) solid var(--dsw-alias-border-l1); border-radius:999px; corner-shape:round; color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); line-height:1.6; text-align:center; }
.dshtavern-wb-new { padding: calc(4px * var(--tv-scale)) calc(10px * var(--tv-scale)); font-size: var(--tv-fs-small); }
.dshtavern-wb-list { display:flex; flex-direction:column; gap: calc(4px * var(--tv-scale)); }
.dshtavern-wb-row { display:flex; flex-direction:column; gap:2px; width:100%; padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale)); border: var(--tv-hairline) solid transparent; border-radius: var(--tv-radius-md); background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent); color: var(--dsw-alias-label-primary); font-family:inherit; text-align:left; cursor:pointer; transition: border-color 150ms ease, background-color 150ms ease; }
.dshtavern-wb-row:hover { border-color: color-mix(in srgb, var(--tv-accent) 50%, transparent); background: color-mix(in srgb, var(--tv-accent) 6%, transparent); }
.dshtavern-wb-row[data-selected='true'] { border-color: color-mix(in srgb, var(--tv-accent) 65%, transparent); background: color-mix(in srgb, var(--tv-accent) 12%, transparent); box-shadow: inset 3px 0 0 var(--tv-accent); }
.dshtavern-wb-row-name { font-size: var(--tv-fs-name); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshtavern-wb-row-meta { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshtavern-wb-flag { align-self:flex-start; margin-top:2px; padding:0 6px; border-radius:999px; corner-shape:round; border: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); color: var(--dsw-alias-state-warn-primary); font-size: calc(var(--tv-fs-small) * 0.9); }
.dshtavern-wb-main { flex:1; min-width:0; display:flex; flex-direction:column; gap: calc(10px * var(--tv-scale)); padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(18px * var(--tv-scale)); overflow:auto; }
.dshtavern-wb-placeholder { margin:auto; display:flex; flex-direction:column; align-items:center; gap:8px; padding:24px; max-width:440px; text-align:center; color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); line-height:1.8; }
.dshtavern-wb-placeholder-title { color: var(--dsw-alias-label-primary); font-size: var(--tv-fs-body); font-weight:500; }
.dshtavern-wb-editor { display:flex; flex-direction:column; gap: calc(10px * var(--tv-scale)); }
.dshtavern-wb-editor-head { display:flex; align-items:center; gap:12px; padding: calc(12px * var(--tv-scale)) calc(14px * var(--tv-scale)); border: var(--tv-hairline) solid var(--dsw-alias-border-l1); border-radius: var(--tv-radius-lg); background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent); }
.dshtavern-wb-editor-title { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.dshtavern-wb-actions { display:flex; gap:8px; flex-shrink:0; }
.dshtavern-wb-grid { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: calc(10px * var(--tv-scale)); }
@media (max-width: 720px) { .dshtavern-wb-grid { grid-template-columns: minmax(0,1fr); } }
.dshtavern-wb-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
.dshtavern-wb-label { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }
.dshtavern-wb-hint { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); line-height:1.5; }
.dshtavern-wb-input, .dshtavern-wb-textarea { box-sizing:border-box; width:100%; padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale)); border: var(--tv-hairline) solid var(--dsw-alias-border-l1); border-radius: var(--tv-radius-sm); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-family:inherit; font-size: var(--tv-fs-small); line-height:1.65; outline:none; }
.dshtavern-wb-textarea { min-height: calc(110px * var(--tv-scale)); resize:vertical; }
.dshtavern-wb-input:focus, .dshtavern-wb-textarea:focus { border-color: var(--tv-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tv-accent) 18%, transparent); }
.dshtavern-wb-toggles { display:flex; flex-wrap:wrap; gap: calc(12px * var(--tv-scale)); }
.dshtavern-wb-toggle { display:flex; align-items:center; gap:6px; font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); cursor:pointer; user-select:none; }
.dshtavern-wb-toggle input { accent-color: var(--tv-accent); cursor:pointer; }
.dshtavern-wb-preview { display:flex; flex-direction:column; gap:6px; padding-top: calc(10px * var(--tv-scale)); border-top: var(--tv-hairline) dashed var(--dsw-alias-border-l1); }
.dshtavern-wb-hits { display:flex; flex-direction:column; gap:4px; }
.dshtavern-wb-hit { display:flex; align-items:center; justify-content:space-between; gap:8px; padding: calc(6px * var(--tv-scale)) calc(10px * var(--tv-scale)); border-radius: var(--tv-radius-sm); background: color-mix(in srgb, var(--tv-accent) 8%, transparent); font-size: var(--tv-fs-small); }
.dshtavern-wb-hit-meta { color: var(--dsw-alias-label-secondary); }
.dshtavern-wb-empty { padding: calc(20px * var(--tv-scale)) calc(8px * var(--tv-scale)); color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); line-height:1.7; }
`

/**
 * Session toolbox styles: the floating launcher, its icon popover, the tool
 * sub-window, and the two tools inside it. The sub-window carries
 * `dshtavern-panel` so it inherits the palette, type scale, and shared
 * controls defined above.
 */
export const TOOLBOX_CSS = `
/* Floating launcher. The surface uses the composer's selector fill so the
   icon stays legible in both themes. */
.dshtavern-fab {
  position: fixed;
  z-index: 72;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent);
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
}
.dshtavern-fab:hover {
  transform: scale(1.04);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--tv-accent);
}
.dshtavern-fab:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: 3px; }
.dshtavern-fab[data-dragging='true'] { cursor: grabbing; transform: scale(1.06); }
.dshtavern-fab[data-open='true'] {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--tv-accent);
  box-shadow: var(--dsw-elevation-prominent), 0 0 0 3px color-mix(in srgb, var(--tv-accent) 45%, transparent);
}
.dshtavern-fab svg { width: 20px; height: 20px; display: block; }
.dshtavern-fab-backdrop {
  position: fixed;
  inset: 0;
  z-index: 69;
  background: transparent;
}
/* Icon popover: an opaque material so the conversation behind it never shows
   through the tiles. */
.dshtavern-tool-popover {
  --tv-accent: var(--dsw-alias-state-business-primary, #4f7fe0);
  position: fixed;
  z-index: 70;
  display: grid;
  grid-template-columns: repeat(2, 78px);
  gap: 6px;
  padding: 10px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-prominent);
  animation: dshtavern-rise-in 160ms ease-out both;
}
.dshtavern-tool-launch {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 78px;
  height: 64px;
  border: var(--tv-hairline, 0.5px) solid transparent;
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
}
.dshtavern-tool-launch:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l1);
}
.dshtavern-tool-launch:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: 2px; }
/* Disabled tiles stay readable: the label keeps the secondary ink and only the
   glyph recedes, so "待实现" reads as unavailable rather than invisible. */
.dshtavern-tool-launch:disabled { cursor: default; }
.dshtavern-tool-launch:disabled .dshtavern-tool-launch-glyph { opacity: 0.5; }
.dshtavern-tool-launch:disabled .dshtavern-tool-launch-label { color: var(--dsw-alias-label-secondary); opacity: 0.7; }
.dshtavern-tool-launch-glyph {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: color-mix(in srgb, var(--tv-accent) 16%, transparent);
  color: var(--tv-accent);
  font-size: 13px;
  font-weight: 500;
}
.dshtavern-tool-launch-label { font-size: 11px; line-height: 1.2; white-space: nowrap; }
/* Tool sub-window. */
.dshtavern-window-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: hidden;
  background: color-mix(in srgb, #000 34%, transparent);
}
.dshtavern-window {
  display: flex;
  flex-direction: column;
  width: min(100%, calc(880px * var(--tv-scale)));
  max-height: min(100%, 84vh);
  border: 0;
  border-radius: var(--tv-radius-panel);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-prominent);
  overflow: hidden;
  animation: dshtavern-window-in 220ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
@keyframes dshtavern-window-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.dshtavern-window-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: calc(16px * var(--tv-scale)) calc(18px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-window-glyph {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--tv-radius-sm);
  background: color-mix(in srgb, var(--tv-accent) 16%, transparent);
  color: var(--tv-accent);
  font-size: 13px;
  font-weight: 500;
}
.dshtavern-window-title { font-size: var(--tv-fs-section); font-weight: 500; line-height: 1.3; }
.dshtavern-window-sub { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }
.dshtavern-window-title, .dshtavern-window-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-window-close {
  display: grid;
  place-items: center;
  margin-left: auto;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.dshtavern-window-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshtavern-window-close:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: 2px; }
/* The body is a column flex container so a tool that owns its own panes can
   claim the remaining height instead of growing past the window. */
.dshtavern-window-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
/* Prompt block switch. */
.dshtavern-switch { position: relative; display: inline-flex; flex: none; cursor: pointer; }
.dshtavern-switch input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.dshtavern-switch-track {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-border-l3);
  transition: background 160ms ease;
}
.dshtavern-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 160ms ease;
}
.dshtavern-switch input:checked + .dshtavern-switch-track { background: var(--tv-accent); }
.dshtavern-switch input:checked + .dshtavern-switch-track .dshtavern-switch-thumb { transform: translateX(14px); }
.dshtavern-switch input:focus-visible + .dshtavern-switch-track { outline: 2px solid var(--tv-accent); outline-offset: 2px; }
.dshtavern-switch input:disabled + .dshtavern-switch-track { opacity: 0.5; }
/* Status pill. */
.dshtavern-pill {
  padding: 2px 9px;
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.5;
  white-space: nowrap;
}
.dshtavern-pill[data-tone='ok'] {
  color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}
.dshtavern-pill[data-tone='busy'] {
  color: var(--dsw-alias-state-warn-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);
}
.dshtavern-pill[data-tone='muted'] {
  color: var(--dsw-alias-label-secondary);
  border-color: var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
/* Prompt orchestration pane inside the tool window. */
.dshtavern-prompt-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(18px * var(--tv-scale));
}
/* Director / character scope switch above the orchestration list. */
.dshtavern-scope-switch {
  display: flex;
  gap: calc(8px * var(--tv-scale));
  margin-bottom: calc(2px * var(--tv-scale));
}
.dshtavern-scope-option {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: calc(9px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.dshtavern-scope-option:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3); }
.dshtavern-scope-option:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--tv-accent); outline-offset: 2px; }
.dshtavern-scope-option[data-active='true'] {
  border-color: var(--tv-accent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
}
.dshtavern-scope-option:disabled { opacity: 0.6; cursor: default; }
.dshtavern-scope-name { font-size: var(--tv-fs-body); font-weight: 500; }
.dshtavern-scope-hint { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.dshtavern-preview { display:flex; flex-direction:column; gap: calc(9px * var(--tv-scale)); padding: calc(12px * var(--tv-scale)); border: var(--tv-hairline) solid var(--dsw-alias-border-l1); border-radius: var(--tv-radius-lg); background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent); }
.dshtavern-preview-head { display:flex; align-items:center; gap:8px; }
.dshtavern-preview-head .dshtavern-window-close { width:24px; height:24px; font-size:12px; }
.dshtavern-preview-controls { display:flex; align-items:flex-end; gap: calc(10px * var(--tv-scale)); flex-wrap:wrap; }
.dshtavern-preview-sample { flex:1; min-width: calc(200px * var(--tv-scale)); }
.dshtavern-preview-body { display:flex; flex-direction:column; gap: calc(8px * var(--tv-scale)); }
.dshtavern-preview-meta { display:flex; gap:6px; flex-wrap:wrap; }
.dshtavern-preview-lore { display:flex; gap:6px; flex-wrap:wrap; }
.dshtavern-preview-lore-chip { display:inline-flex; align-items:center; padding:2px 9px; border-radius:999px; corner-shape:round; border: var(--tv-hairline) solid color-mix(in srgb, var(--tv-accent) 40%, transparent); background: color-mix(in srgb, var(--tv-accent) 10%, transparent); color: var(--tv-accent); font-size: var(--tv-fs-small); }
.dshtavern-preview-lore-chip[data-audience='director'] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); color: var(--dsw-alias-state-warn-primary); }
.dshtavern-preview-lore-meta { opacity:0.75; }
.dshtavern-preview-system { max-height: calc(340px * var(--tv-scale)); overflow:auto; margin:0; padding: calc(10px * var(--tv-scale)) calc(12px * var(--tv-scale)); border-radius: var(--tv-radius-sm); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family-mono, ui-monospace, monospace); font-size: var(--tv-fs-small); line-height:1.7; white-space:pre-wrap; word-break:break-word; }
.dshtavern-prompt-toolbar .dshtavern-button[data-active='true'] { border-color: var(--tv-accent); color: var(--tv-accent); }
.dshtavern-prompt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: calc(10px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-prompt-toolbar .dshtavern-hint { flex: 1; min-width: 0; }
.dshtavern-prompt-panel .dshtavern-prompt-list { gap: calc(8px * var(--tv-scale)); }
.dshtavern-prompt-edit-hint {
  font-size: var(--tv-fs-small);
  color: var(--tv-accent);
  white-space: nowrap;
}
/* Prompt-block edit dialog: a separate floating window above the tool window. */
.dshtavern-editor-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: color-mix(in srgb, #000 40%, transparent);
}
.dshtavern-editor-dialog {
  display: flex;
  flex-direction: column;
  width: min(100%, calc(720px * var(--tv-scale)));
  max-height: min(100%, 84vh);
  border: 0;
  border-radius: var(--tv-radius-panel);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-prominent);
  overflow: hidden;
  animation: dshtavern-window-in 200ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
.dshtavern-editor-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(16px * var(--tv-scale)) calc(18px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-editor-title { font-size: var(--tv-fs-section); font-weight: 500; line-height: 1.3; }
.dshtavern-editor-sub { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }
.dshtavern-editor-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 240px;
  max-height: 52vh;
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale));
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--tv-fs-small);
  line-height: 1.7;
  resize: vertical;
  outline: none;
}
.dshtavern-editor-textarea:focus {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tv-accent) 45%, transparent);
}
.dshtavern-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(12px * var(--tv-scale)) calc(18px * var(--tv-scale));
  border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-editor-actions .dshtavern-hint { margin-right: auto; }
/* Character-card tool: left list, right editor. */
.dshtavern-character-panel {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.dshtavern-character-sidebar {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--tv-scale));
  flex-shrink: 0;
  width: calc(232px * var(--tv-scale));
  padding: calc(14px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border-right: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
  overflow: auto;
}
.dshtavern-character-side-head {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--tv-scale));
  padding-bottom: calc(10px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-character-side-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dshtavern-character-side-actions { display: flex; gap: calc(6px * var(--tv-scale)); }
.dshtavern-character-side-actions .dshtavern-button { flex: 1 1 0; min-width: 0; }
.dshtavern-character-heading {
  flex: 1;
  min-width: 0;
  font-size: var(--tv-fs-section);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-character-count {
  flex: none;
  min-width: 20px;
  padding: 0 6px;
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  corner-shape: round;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.6;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.dshtavern-character-new { padding: calc(4px * var(--tv-scale)) calc(10px * var(--tv-scale)); font-size: var(--tv-fs-small); }
.dshtavern-character-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--tv-scale));
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(18px * var(--tv-scale));
  overflow: auto;
}
.dshtavern-character-list { display: flex; flex-direction: column; gap: calc(4px * var(--tv-scale)); }
.dshtavern-character-row {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--tv-scale));
  width: 100%;
  padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: var(--tv-hairline) solid transparent;
  border-radius: var(--tv-radius-md);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.dshtavern-character-row:hover {
  border-color: color-mix(in srgb, var(--tv-accent) 50%, transparent);
  background: color-mix(in srgb, var(--tv-accent) 6%, transparent);
}
.dshtavern-character-row:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: 1px; }
.dshtavern-character-row[data-selected='true'] {
  border-color: color-mix(in srgb, var(--tv-accent) 65%, transparent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
  box-shadow: inset 3px 0 0 var(--tv-accent);
}
.dshtavern-character-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: calc(32px * var(--tv-scale));
  height: calc(32px * var(--tv-scale));
  border-radius: var(--tv-radius-sm);
  background: color-mix(in srgb, var(--tv-accent) 16%, transparent);
  color: var(--tv-accent);
  font-size: var(--tv-fs-body);
  font-weight: 500;
}
.dshtavern-character-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshtavern-character-name {
  font-size: var(--tv-fs-name);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-character-meta {
  font-size: var(--tv-fs-small);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-character-empty {
  padding: calc(24px * var(--tv-scale)) calc(8px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.7;
}
.dshtavern-character-problems {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: calc(8px * var(--tv-scale));
  border-top: var(--tv-hairline) dashed var(--dsw-alias-border-l1);
}
.dshtavern-character-editor { display: flex; flex-direction: column; gap: calc(10px * var(--tv-scale)); }
.dshtavern-character-editor-head {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--tv-scale));
  padding: calc(12px * var(--tv-scale)) calc(14px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
}
.dshtavern-character-editor-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: calc(44px * var(--tv-scale));
  height: calc(44px * var(--tv-scale));
  border-radius: var(--tv-radius-md);
  background: color-mix(in srgb, var(--tv-accent) 18%, transparent);
  color: var(--tv-accent);
  font-size: calc(var(--tv-fs-section) * 1.2);
  font-weight: 500;
}
.dshtavern-character-editor-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshtavern-character-editor-title .dshtavern-character-meta { display: block; }
.dshtavern-character-actions { display: flex; gap: 8px; flex-shrink: 0; }
.dshtavern-character-form { display: flex; flex-direction: column; gap: calc(10px * var(--tv-scale)); }
.dshtavern-character-group {
  display: flex;
  flex-direction: column;
  gap: calc(9px * var(--tv-scale));
  padding: calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);
}
.dshtavern-character-group-title {
  font-size: var(--tv-fs-small);
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--dsw-alias-label-secondary);
}
.dshtavern-character-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: calc(10px * var(--tv-scale));
}
@media (max-width: 720px) {
  .dshtavern-character-grid { grid-template-columns: minmax(0, 1fr); }
}
.dshtavern-character-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dshtavern-character-label { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }
.dshtavern-character-input,
.dshtavern-character-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: var(--tv-fs-small);
  line-height: 1.65;
  outline: none;
}
.dshtavern-character-textarea { min-height: calc(76px * var(--tv-scale)); resize: vertical; }
.dshtavern-character-input:focus,
.dshtavern-character-textarea:focus {
  border-color: var(--tv-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tv-accent) 18%, transparent);
}
.dshtavern-character-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  padding: 24px;
  max-width: 440px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.8;
}
.dshtavern-character-placeholder-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(52px * var(--tv-scale));
  height: calc(52px * var(--tv-scale));
  margin-bottom: 4px;
  border-radius: var(--tv-radius-lg);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
  color: var(--tv-accent);
  font-size: calc(var(--tv-fs-section) * 1.3);
  font-weight: 500;
}
.dshtavern-character-placeholder-title {
  color: var(--dsw-alias-label-primary);
  font-size: var(--tv-fs-body);
  font-weight: 500;
}
.dshtavern-character-hint-path {
  max-width: 100%;
  margin-top: 4px;
  padding: 6px 10px;
  border-radius: var(--tv-radius-sm);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--tv-fs-small);
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .dshtavern-editor-dialog, .dshtavern-window, .dshtavern-tool-popover { animation: none !important; }
  .dshtavern-fab, .dshtavern-tool-launch, .dshtavern-prompt-card, .dshtavern-switch-track, .dshtavern-switch-thumb, .dshtavern-character-row { transition: none !important; }
  .dshtavern-fab:hover, .dshtavern-fab[data-dragging='true'], .dshtavern-tool-launch:hover:not(:disabled) { transform: none; }
}
/* Usage panel: workspace/session totals, two meters, and a session table. */
.dshtavern-usage {
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--tv-scale));
  width: 100%;
  max-width: calc(720px * var(--tv-scale));
  margin: 0 auto;
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(18px * var(--tv-scale));
  box-sizing: border-box;
}
.dshtavern-usage-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(260px * var(--tv-scale)), 1fr));
  gap: calc(10px * var(--tv-scale));
}
.dshtavern-usage-card {
  min-width: 0;
  padding: calc(12px * var(--tv-scale)) calc(14px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: var(--dsw-alias-bg-layer-2);
}
.dshtavern-usage-card-title {
  margin-bottom: calc(10px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  letter-spacing: 0.02em;
}
.dshtavern-usage-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(4px * var(--tv-scale)) calc(16px * var(--tv-scale));
}
.dshtavern-usage-metric { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dshtavern-usage-metric-label { color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); }
.dshtavern-usage-metric-value {
  color: var(--dsw-alias-label-primary);
  font-size: calc(19px * var(--tv-scale));
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.dshtavern-usage-metric-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtavern-usage-meters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(260px * var(--tv-scale)), 1fr));
  gap: calc(12px * var(--tv-scale)) calc(16px * var(--tv-scale));
}
.dshtavern-usage-meter {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--tv-scale));
  min-width: 0;
  padding: calc(10px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: var(--dsw-alias-bg-layer-2);
}
.dshtavern-usage-meter-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.dshtavern-usage-meter-value {
  color: var(--dsw-alias-label-primary);
  font-size: var(--tv-fs-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dshtavern-usage-meter-caption {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dshtavern-usage-meter-track {
  position: relative;
  height: calc(6px * var(--tv-scale));
  border-radius: 999px;
  corner-shape: round;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  overflow: hidden;
}
.dshtavern-usage-meter-fill {
  height: 100%;
  min-width: 3px;
  border-radius: inherit;
  background: var(--tv-accent);
  transition: width 240ms ease;
}
.dshtavern-usage-meter-track[data-tone='warm'] .dshtavern-usage-meter-fill { background: var(--dsw-alias-state-warn-primary); }
.dshtavern-usage-meter-track[data-tone='hot'] .dshtavern-usage-meter-fill { background: var(--dsw-alias-state-danger-primary, var(--dsw-alias-state-warn-primary)); }
.dshtavern-usage-meter-track[data-tone='muted'] .dshtavern-usage-meter-fill { background: transparent; }
.dshtavern-usage-sessions {
  display: flex;
  flex-direction: column;
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  overflow: hidden;
}
.dshtavern-usage-session-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) calc(70px * var(--tv-scale)) calc(56px * var(--tv-scale)) calc(60px * var(--tv-scale));
  align-items: center;
  gap: calc(12px * var(--tv-scale));
  padding: calc(7px * var(--tv-scale)) calc(12px * var(--tv-scale));
}
.dshtavern-usage-session-row + .dshtavern-usage-session-row { border-top: var(--tv-hairline) solid var(--dsw-alias-border-l1); }
.dshtavern-usage-session-head {
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
  font-size: var(--tv-fs-small);
}
.dshtavern-usage-session-head .dshtavern-usage-session-title { font-size: var(--tv-fs-small); }
.dshtavern-usage-session-row[data-current='true'] {
  background: color-mix(in srgb, var(--tv-accent) 9%, transparent);
}
.dshtavern-usage-session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--tv-fs-body);
}
.dshtavern-usage-session-cell {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dshtavern-usage-session-row[data-current='true'] .dshtavern-usage-session-cell { color: var(--dsw-alias-label-primary); }
.dshtavern-usage-empty {
  padding: calc(14px * var(--tv-scale));
  border: var(--tv-hairline) dashed var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  text-align: center;
}
.dshtavern-usage-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
}
.dshtavern-usage-foot-time { font-variant-numeric: tabular-nums; opacity: 0.85; }
.dshtavern-usage-error { display: flex; flex-direction: column; gap: 4px; }
.dshtavern-usage-error-hint { color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); }
.dshtavern-usage-notice { font-size: var(--tv-fs-small); }
@media (max-width: 520px) {
  .dshtavern-usage-session-row {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .dshtavern-usage-session-row > :nth-child(4) { display: none; }
}
/* Agent orchestration: runtime knobs grouped by what they control. The panel
   fills the window body so its tab strip can stay fixed while one pane scrolls. */
.dshtavern-agent {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: calc(12px * var(--tv-scale));
  width: 100%;
  max-width: calc(720px * var(--tv-scale));
  margin: 0 auto;
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(18px * var(--tv-scale));
  box-sizing: border-box;
  min-height: 0;
}
.dshtavern-agent-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(8px * var(--tv-scale));
  padding-bottom: calc(10px * var(--tv-scale));
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
}
.dshtavern-agent-toolbar .dshtavern-pill { margin-right: auto; }
.dshtavern-agent-group {
  display: flex;
  flex-direction: column;
  gap: calc(2px * var(--tv-scale));
  padding: calc(10px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: var(--dsw-alias-bg-layer-2);
}
.dshtavern-agent-group-title {
  margin-bottom: calc(4px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  letter-spacing: 0.02em;
}
.dshtavern-agent-group-note {
  margin-bottom: calc(6px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.5;
  opacity: 0.85;
}
.dshtavern-agent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(12px * var(--tv-scale));
  padding: calc(7px * var(--tv-scale)) 0;
  border-top: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent);
}
.dshtavern-agent-group > .dshtavern-agent-row:first-of-type { border-top: 0; }
.dshtavern-agent-row-toggle { cursor: pointer; }
.dshtavern-agent-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dshtavern-agent-label { font-size: var(--tv-fs-body); line-height: 1.4; }
.dshtavern-agent-changed { margin-left: 4px; color: var(--tv-accent); font-size: var(--tv-fs-small); }
.dshtavern-agent-hint { color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); line-height: 1.45; }
.dshtavern-agent-input-wrap { display: flex; align-items: center; gap: calc(6px * var(--tv-scale)); flex: none; }
.dshtavern-agent-input {
  width: calc(78px * var(--tv-scale));
  padding: calc(5px * var(--tv-scale)) calc(8px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: var(--tv-fs-small);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dshtavern-agent-input:focus {
  outline: none;
  border-color: var(--tv-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tv-accent) 18%, transparent);
}
.dshtavern-agent-input:disabled { opacity: 0.55; }
.dshtavern-agent-unit { color: var(--dsw-alias-label-secondary); font-size: var(--tv-fs-small); }
.dshtavern-agent-range {
  min-width: calc(58px * var(--tv-scale));
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.dshtavern-agent-select {
  min-width: 0;
  flex: 1 1 0;
  padding: calc(5px * var(--tv-scale)) calc(8px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: var(--tv-fs-small);
}
.dshtavern-agent-select-inline { flex: 0 0 auto; min-width: calc(120px * var(--tv-scale)); }
.dshtavern-agent-select:focus { outline: none; border-color: var(--tv-accent); }
.dshtavern-agent-select:disabled { opacity: 0.55; }
.dshtavern-agent-model {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--tv-scale));
  padding: calc(9px * var(--tv-scale)) 0;
  border-top: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent);
}
.dshtavern-agent-model-line { display: flex; align-items: center; gap: calc(8px * var(--tv-scale)); min-width: 0; }
.dshtavern-agent-effort { width: auto; flex: 1 1 0; text-align: left; }
.dshtavern-agent-quick {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--tv-scale));
  flex-wrap: wrap;
  padding: calc(6px * var(--tv-scale)) 0 calc(8px * var(--tv-scale));
}
.dshtavern-agent-quick-button {
  padding: calc(3px * var(--tv-scale)) calc(10px * var(--tv-scale));
  font-size: var(--tv-fs-small);
}
.dshtavern-agent-quick-button[data-active='true'] {
  border-color: var(--tv-accent);
  color: var(--tv-accent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
}
.dshtavern-agent-subhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: calc(4px * var(--tv-scale));
  padding-top: calc(8px * var(--tv-scale));
  border-top: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent);
}
.dshtavern-agent-chars {
  display: flex;
  flex-direction: column;
  gap: calc(2px * var(--tv-scale));
  max-height: calc(220px * var(--tv-scale));
  overflow: auto;
}
.dshtavern-agent-char-row {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--tv-scale));
  padding: calc(5px * var(--tv-scale)) 0;
}
.dshtavern-agent-char-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--tv-fs-body);
}
.dshtavern-agent-char-input { width: calc(84px * var(--tv-scale)); flex: none; }

@media (max-width: 560px) {
  .dshtavern-agent-row { flex-direction: column; align-items: stretch; gap: 6px; }
  .dshtavern-agent-row-toggle { flex-direction: row; align-items: center; }
  .dshtavern-agent-input-wrap { justify-content: flex-end; }
}

/* ---- Story tracker -------------------------------------------------------
 * Laid out like the other tool panels: a centred column with its own gutter.
 * Every row is a two-column grid so a long label shrinks instead of pushing its
 * control past the window edge, and free text breaks anywhere — provider errors
 * carry unbroken request ids, and one of those used to widen the whole panel
 * until the right-aligned controls were clipped. */
.dshtavern-tracker {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: calc(14px * var(--tv-scale));
  width: 100%;
  max-width: calc(760px * var(--tv-scale));
  margin: 0 auto;
  padding: calc(14px * var(--tv-scale)) calc(18px * var(--tv-scale)) calc(22px * var(--tv-scale));
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow-wrap: anywhere;
}
.dshtavern-tracker-card,
.dshtavern-tracker-group {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--tv-scale));
  padding: calc(14px * var(--tv-scale)) calc(16px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
  box-sizing: border-box;
  min-width: 0;
}
.dshtavern-tracker-head,
.dshtavern-tracker-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.dshtavern-tracker-title,
.dshtavern-tracker-group-title { font-size: var(--tv-fs-section); font-weight: 500; min-width: 0; }
.dshtavern-tracker-hint,
.dshtavern-tracker-group-note {
  font-size: var(--tv-fs-small);
  color: var(--dsw-alias-label-secondary);
  line-height: 1.65;
}

/* Status: one sentence plus the two actions that can change it. Wraps rather
   than squeezing the sentence when the window is narrow. */
.dshtavern-tracker-status {
  flex: none;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.dshtavern-tracker-status-main { display: flex; align-items: flex-start; gap: 8px; flex: 1 1 300px; min-width: 0; }
.dshtavern-tracker-dot { flex: none; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.dshtavern-tracker-dot[data-tone='on'] { background: var(--dsw-alias-state-success-primary, #3ba55d); }
.dshtavern-tracker-dot[data-tone='warn'] { background: var(--dsw-alias-state-warn-primary, #d98b20); }
.dshtavern-tracker-status-text { font-size: var(--tv-fs-body); line-height: 1.65; min-width: 0; }
.dshtavern-tracker-status-actions { display: flex; gap: 8px; flex: none; margin-left: auto; }

/* Out-of-date notice: same card shape, warning tone. */
.dshtavern-tracker-stale {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: calc(10px * var(--tv-scale)) calc(14px * var(--tv-scale));
  border: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d98b20) 45%, transparent);
  border-radius: var(--tv-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d98b20) 10%, transparent);
  font-size: var(--tv-fs-small);
  line-height: 1.6;
}
.dshtavern-tracker-stale-title { font-weight: 500; color: var(--dsw-alias-state-warn-primary, #d98b20); flex: none; }
.dshtavern-tracker-stale .dshtavern-button { margin-left: auto; }

/* One setting: label block on the left (shrinks), control on the right (fixed). */
.dshtavern-tracker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: calc(14px * var(--tv-scale));
  min-width: 0;
}
.dshtavern-tracker-row-toggle { padding: calc(2px * var(--tv-scale)) 0; }
.dshtavern-tracker-row-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dshtavern-tracker-label { font-size: var(--tv-fs-body); }
.dshtavern-tracker-input-wrap { display: flex; align-items: center; gap: 6px; flex: none; }
.dshtavern-tracker-input {
  width: calc(92px * var(--tv-scale));
  padding: calc(6px * var(--tv-scale)) calc(9px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: var(--tv-fs-body);
  text-align: right;
  font-variant-numeric: tabular-nums;
  outline: none;
}
.dshtavern-tracker-input:focus { border-color: var(--tv-accent); }
.dshtavern-tracker-input:disabled { opacity: 0.5; }
.dshtavern-tracker-unit { flex: none; width: calc(30px * var(--tv-scale)); font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }

/* Trigger choice: two equal tiles. */
.dshtavern-tracker-triggers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(8px * var(--tv-scale)); }
.dshtavern-tracker-trigger {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: calc(10px * var(--tv-scale)) calc(12px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.dshtavern-tracker-trigger:hover:not(:disabled) { border-color: color-mix(in srgb, var(--tv-accent) 45%, transparent); }
.dshtavern-tracker-trigger[data-active='true'] {
  border-color: var(--tv-accent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px var(--tv-accent);
}
.dshtavern-tracker-trigger:disabled { opacity: 0.5; cursor: default; }
.dshtavern-tracker-trigger-name { font-size: var(--tv-fs-body); font-weight: 500; }
.dshtavern-tracker-trigger-hint { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); }

.dshtavern-tracker-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: calc(2px * var(--tv-scale)); }
/* The save actions stay reachable while a long settings page scrolls under them. */
.dshtavern-subtabs-pane > .dshtavern-tracker-actions {
  position: sticky;
  bottom: 0;
  padding: calc(10px * var(--tv-scale)) 0 calc(2px * var(--tv-scale));
  background: var(--dsw-alias-bg-layer-1);
}

/* Records: a heading and a stack of ledger cards, not a card around cards. */
.dshtavern-tracker-records { display: flex; flex-direction: column; gap: calc(10px * var(--tv-scale)); min-width: 0; }
.dshtavern-tracker-chat { display: flex; flex-direction: column; gap: calc(8px * var(--tv-scale)); min-width: 0; }
.dshtavern-tracker-chat-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.dshtavern-tracker-chat-title { font-size: var(--tv-fs-body); font-weight: 500; }

/* Sub-page strip shared by the tool panels. The strip stays put while the pane
   below it scrolls, so a panel with many settings never becomes one long page.
   Equal-width tabs, the active one underlined in the accent so it reads as a
   section of one panel rather than as three buttons. */
.dshtavern-subtabs {
  display: flex;
  flex: none;
  gap: 2px;
  border-bottom: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  min-width: 0;
}
.dshtavern-subtab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
  padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: var(--tv-fs-body);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  transition: color 150ms ease, border-color 150ms ease;
}
.dshtavern-subtab-label { overflow: hidden; text-overflow: ellipsis; }
.dshtavern-subtab-changed { color: var(--tv-accent); font-size: calc(var(--tv-fs-small) * 0.8); line-height: 1; }
.dshtavern-subtab:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshtavern-subtab[data-active='true'] {
  color: var(--tv-accent);
  border-bottom-color: var(--tv-accent);
  font-weight: 500;
}
.dshtavern-subtab:disabled { opacity: 0.45; cursor: default; }
.dshtavern-subtab:focus-visible { outline: 2px solid var(--tv-accent); outline-offset: -2px; }
/* The open page claims the leftover window height and owns the scroll. */
.dshtavern-subtabs-pane {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--tv-scale));
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}
.dshtavern-tracker-empty {
  padding: calc(24px * var(--tv-scale)) calc(16px * var(--tv-scale));
  border: var(--tv-hairline) dashed var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--tv-fs-small);
  line-height: 1.7;
  text-align: center;
}

/* Length presets: four tiles in one row, wrapping to two on narrow windows. */
.dshtavern-tracker-presets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(6px * var(--tv-scale)); }
.dshtavern-tracker-preset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}
.dshtavern-tracker-preset:hover:not(:disabled) { border-color: color-mix(in srgb, var(--tv-accent) 45%, transparent); }
.dshtavern-tracker-preset[data-active='true'] {
  border-color: var(--tv-accent);
  background: color-mix(in srgb, var(--tv-accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px var(--tv-accent);
}
.dshtavern-tracker-preset:disabled { opacity: 0.5; cursor: default; }
.dshtavern-tracker-preset-name { font-size: var(--tv-fs-body); font-weight: 500; }
.dshtavern-tracker-preset-hint { font-size: calc(var(--tv-fs-small) * 0.95); color: var(--dsw-alias-label-secondary); line-height: 1.4; }

/* The newest ledger carries a slightly stronger frame: it is the one a player
   reads mid-scene, while older ones are reference. */
.dshtavern-tracker-summary-newest { border-color: color-mix(in srgb, var(--tv-accent) 40%, var(--dsw-alias-border-l1)); }

/* An error is free text from a provider: it must never widen the panel. */
.dshtavern-tracker-error {
  padding: calc(8px * var(--tv-scale)) calc(11px * var(--tv-scale));
  border-radius: var(--tv-radius-sm);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d94848) 10%, transparent);
  color: var(--dsw-alias-state-error-primary, #d94848);
  font-size: var(--tv-fs-small);
  line-height: 1.6;
  overflow-wrap: anywhere;
  min-width: 0;
}
.dshtavern-tracker-summary {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--tv-scale));
  padding: calc(13px * var(--tv-scale)) calc(15px * var(--tv-scale));
  border: var(--tv-hairline) solid var(--dsw-alias-border-l1);
  border-radius: var(--tv-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  box-sizing: border-box;
  min-width: 0;
}
.dshtavern-tracker-summary-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: calc(9px * var(--tv-scale));
  border-bottom: var(--tv-hairline) dashed var(--dsw-alias-border-l1);
  min-width: 0;
}
.dshtavern-tracker-summary-size { margin-left: auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dshtavern-tracker-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  corner-shape: round;
  border: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-state-success-primary, #3ba55d) 45%, transparent);
  color: var(--dsw-alias-state-success-primary, #3ba55d);
  font-size: var(--tv-fs-small);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dshtavern-tracker-badge[data-tone='warn'] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d98b20) 45%, transparent); color: var(--dsw-alias-state-warn-primary, #d98b20); }
.dshtavern-tracker-badge[data-tone='busy'] { border-color: color-mix(in srgb, var(--tv-accent) 45%, transparent); color: var(--tv-accent); }
.dshtavern-tracker-section { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dshtavern-tracker-section-title { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); letter-spacing: 0.02em; }
.dshtavern-tracker-text { margin: 0; font-size: var(--tv-fs-body); line-height: 1.8; overflow-wrap: anywhere; }
.dshtavern-tracker-entry { display: flex; flex-direction: column; gap: 3px; padding-left: 12px; border-left: 2px solid color-mix(in srgb, var(--tv-accent) 35%, transparent); min-width: 0; }
.dshtavern-tracker-entry-name { font-size: var(--tv-fs-name); font-weight: 500; color: var(--tv-accent); }
@media (max-width: 620px) {
  .dshtavern-tracker-triggers { grid-template-columns: minmax(0, 1fr); }
  .dshtavern-tracker-presets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dshtavern-tracker-status-actions { margin-left: 0; width: 100%; }
  .dshtavern-tracker-status-actions .dshtavern-button { flex: 1 1 0; }
  .dshtavern-tracker-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .dshtavern-tracker-input-wrap { justify-content: flex-end; }
}
`
