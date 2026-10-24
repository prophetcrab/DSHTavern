window.__ModuleLoader__.load({
	id: "dshtavern",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/styles.ts
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
		const PANEL_CSS = `
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
`;
		/** Shared class names; every rule is prefixed with `dshtavern-`. */
		const CLASS = {
			panel: "dshtavern-panel",
			card: "dshtavern-card",
			cardHead: "dshtavern-card-head",
			headMain: "dshtavern-head-main",
			headSide: "dshtavern-head-side",
			title: "dshtavern-header-title",
			subtitle: "dshtavern-subtitle",
			meta: "dshtavern-meta",
			banners: "dshtavern-card-banners",
			cardBody: "dshtavern-card-body",
			pane: "dshtavern-pane",
			group: "dshtavern-group",
			cardFoot: "dshtavern-card-foot",
			sectionTitle: "dshtavern-section-title",
			count: "dshtavern-count",
			row: "dshtavern-row",
			rowMain: "dshtavern-row-main",
			name: "dshtavern-name",
			path: "dshtavern-path",
			input: "dshtavern-input",
			button: "dshtavern-button",
			buttonPulse: "dshtavern-button dshtavern-button-pulse",
			buttonPrimary: "dshtavern-button dshtavern-button-primary",
			buttonDanger: "dshtavern-button dshtavern-button-danger",
			banner: "dshtavern-banner",
			bannerError: "dshtavern-banner dshtavern-banner-error",
			bannerNotice: "dshtavern-banner dshtavern-banner-notice",
			bannerAction: "dshtavern-banner-action",
			form: "dshtavern-form",
			field: "dshtavern-field",
			label: "dshtavern-label",
			formActions: "dshtavern-form-actions",
			hint: "dshtavern-hint",
			tabs: "dshtavern-tabs",
			tab: "dshtavern-tab",
			tabActive: "dshtavern-tab dshtavern-tab-active",
			promptHead: "dshtavern-prompt-head",
			promptList: "dshtavern-prompt-list",
			promptCard: "dshtavern-prompt-card",
			promptCardDragging: "dshtavern-prompt-card dshtavern-prompt-card-dragging",
			promptCardOver: "dshtavern-prompt-card dshtavern-prompt-card-over",
			promptIndex: "dshtavern-prompt-index",
			promptMain: "dshtavern-prompt-main",
			promptName: "dshtavern-prompt-name",
			promptMeta: "dshtavern-prompt-meta",
			dragHandle: "dshtavern-drag-handle",
			badge: "dshtavern-badge",
			saveStatus: "dshtavern-save-status",
			toggle: "dshtavern-toggle",
			rowSelected: "dshtavern-row dshtavern-row-selected"
		};
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
		const STORY_CSS = `
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
.dshtavern-wb-group { display: flex; flex-direction: column; gap: 4px; }
.dshtavern-wb-group + .dshtavern-wb-group { margin-top: calc(10px * var(--tv-scale)); }
.dshtavern-wb-group-head { display: flex; align-items: baseline; gap: 6px; padding: 0 2px calc(2px * var(--tv-scale)); }
.dshtavern-wb-group-title { font-size: var(--tv-fs-small); font-weight: 500; color: var(--dsw-alias-label-secondary); letter-spacing: 0.03em; }
.dshtavern-wb-group-count { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); opacity: 0.7; font-variant-numeric: tabular-nums; }
.dshtavern-wb-row { display:flex; flex-direction:column; gap:2px; width:100%; padding: calc(8px * var(--tv-scale)) calc(10px * var(--tv-scale)); border: var(--tv-hairline) solid transparent; border-radius: var(--tv-radius-md); background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent); color: var(--dsw-alias-label-primary); font-family:inherit; text-align:left; cursor:pointer; transition: border-color 150ms ease, background-color 150ms ease; }
.dshtavern-wb-row:hover { border-color: color-mix(in srgb, var(--tv-accent) 50%, transparent); background: color-mix(in srgb, var(--tv-accent) 6%, transparent); }
.dshtavern-wb-row[data-selected='true'] { border-color: color-mix(in srgb, var(--tv-accent) 65%, transparent); background: color-mix(in srgb, var(--tv-accent) 12%, transparent); box-shadow: inset 3px 0 0 var(--tv-accent); }
.dshtavern-wb-row-name { font-size: var(--tv-fs-name); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshtavern-wb-row-meta { font-size: var(--tv-fs-small); color: var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshtavern-wb-flag { align-self:flex-start; margin-top:2px; padding:0 6px; border-radius:999px; corner-shape:round; border: var(--tv-hairline) solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); color: var(--dsw-alias-state-warn-primary); font-size: calc(var(--tv-fs-small) * 0.9); }
.dshtavern-prompt-persona { margin-top: 6px; max-width: calc(320px * var(--tv-scale)); }
.dshtavern-prompt-persona .dshtavern-wb-input { font-size: var(--tv-fs-small); padding: calc(5px * var(--tv-scale)) calc(8px * var(--tv-scale)); }
.dshtavern-wb-flag-active { border-color: color-mix(in srgb, var(--tv-accent) 45%, transparent); color: var(--tv-accent); }
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
`;
		/**
		* Session toolbox styles: the floating launcher, its icon popover, the tool
		* sub-window, and the two tools inside it. The sub-window carries
		* `dshtavern-panel` so it inherits the palette, type scale, and shared
		* controls defined above.
		*/
		const TOOLBOX_CSS = `
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
`;
		//#endregion
		//#region src/client/characters.ts
		/**
		* Character-card tool: left list of every `.charc` card in the current tavern
		* workspace, right pane for creating/editing the selected one.
		*/
		const INITIAL$2 = {
			loading: true,
			saving: false,
			error: null,
			notice: null,
			cards: [],
			problems: []
		};
		const NEW_DRAFT = {
			id: null,
			name: "",
			description: "",
			personality: "",
			scenario: "",
			systemPrompt: "",
			exampleDialogues: "",
			greeting: "",
			tags: "",
			updatedAt: ""
		};
		function errorText$6(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		async function readJson$4(response) {
			const body = await response.json();
			if (!response.ok || body.ok !== true) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
			return body;
		}
		async function loadCards(workspaceId) {
			const body = await readJson$4(await fetch(`/tavern/characters?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: { accept: "application/json" } }));
			return {
				cards: Array.isArray(body.cards) ? body.cards : [],
				problems: Array.isArray(body.problems) ? body.problems : []
			};
		}
		/**
		* Read one workspace's character cards for another panel.
		*
		* The prompt-preview picker needs the real card names before a preview exists;
		* reading them through the preview response would leave the picker empty until
		* the first preview runs.
		* @param workspaceId - tavern workspace id.
		* @returns readable cards, newest first.
		*/
		async function fetchCharacterCards(workspaceId) {
			return (await loadCards(workspaceId)).cards;
		}
		async function writeCard(workspaceId, action, id, draft) {
			const body = await readJson$4(await fetch("/tavern/characters", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					action,
					...id === null ? {} : { id },
					card: {
						name: draft.name,
						description: draft.description,
						personality: draft.personality,
						scenario: draft.scenario,
						systemPrompt: draft.systemPrompt,
						exampleDialogues: draft.exampleDialogues,
						greetings: {
							first: draft.greeting,
							alternates: []
						},
						tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
						entries: []
					}
				})
			}));
			if (typeof body.card !== "object" || body.card === null) throw new Error("服务端没有返回角色卡");
			return body.card;
		}
		async function removeCard(workspaceId, id) {
			await readJson$4(await fetch("/tavern/characters", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					action: "delete",
					id
				})
			}));
		}
		/**
		* Ask the host for one card's `.charc` document.
		* @param workspaceId - tavern workspace id.
		* @param id - card id.
		* @returns the suggested file name and document text.
		*/
		async function exportCharacterCard(workspaceId, id) {
			const body = await readJson$4(await fetch(`/tavern/characters/transfer?workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(id)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			return {
				file: String(body.file),
				text: String(body.text)
			};
		}
		/**
		* Import one `.charc` document into the workspace.
		* @param workspaceId - tavern workspace id.
		* @param text - document text.
		* @returns the stored card.
		*/
		async function importCharacterCard(workspaceId, text) {
			const body = await readJson$4(await fetch("/tavern/characters/transfer", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					text
				})
			}));
			if (typeof body.card !== "object" || body.card === null) throw new Error("服务端没有返回角色卡");
			return body.card;
		}
		/**
		* Save one document to the user's disk.
		*
		* The client owns the download because the host cannot reach the browser's
		* save dialog; the text is produced by the host so both sides read one format.
		* @param transfer - suggested file name and content.
		*/
		function downloadDocument(transfer) {
			const blob = new Blob([transfer.text], { type: "application/json;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = transfer.file;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1e4);
		}
		/**
		* Ask the user to pick one file and read it as text.
		* @param accept - file input accept filter.
		* @returns the file name and text, or `undefined` when the picker was dismissed.
		*/
		async function pickTextFile(accept) {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = accept;
			input.style.display = "none";
			document.body.appendChild(input);
			try {
				const file = await new Promise((resolve) => {
					input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
					input.addEventListener("cancel", () => resolve(void 0), { once: true });
					input.click();
				});
				if (file === void 0) return void 0;
				return {
					name: file.name,
					text: await file.text()
				};
			} finally {
				input.remove();
			}
		}
		function draftOf(card) {
			return {
				id: card.id,
				name: card.name,
				description: card.description,
				personality: card.personality,
				scenario: card.scenario,
				systemPrompt: card.systemPrompt,
				exampleDialogues: card.exampleDialogues,
				greeting: card.greetings.first,
				tags: card.tags.join(", "),
				updatedAt: card.updatedAt
			};
		}
		function Field$2(props) {
			return (0, react.createElement)("label", { className: "dshtavern-character-field" }, (0, react.createElement)("span", { className: "dshtavern-character-label" }, props.label), props.multiline === true ? (0, react.createElement)("textarea", {
				className: "dshtavern-character-textarea",
				value: props.value,
				placeholder: props.placeholder ?? "",
				rows: 3,
				onChange: (event) => props.onChange(event.target.value)
			}) : (0, react.createElement)("input", {
				className: "dshtavern-character-input",
				value: props.value,
				placeholder: props.placeholder ?? "",
				onChange: (event) => props.onChange(event.target.value)
			}));
		}
		/** Two-pane character-card tool. */
		function CharacterCardTool(props) {
			const [state, setState] = (0, react.useState)(INITIAL$2);
			const [draft, setDraft] = (0, react.useState)(null);
			const [confirmDelete, setConfirmDelete] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(async (notice = null) => {
				try {
					const { cards, problems } = await loadCards(props.workspaceId);
					setState({
						loading: false,
						saving: false,
						error: null,
						notice,
						cards,
						problems
					});
				} catch (cause) {
					setState((prev) => ({
						...prev,
						loading: false,
						saving: false,
						error: errorText$6(cause),
						notice: null
					}));
				}
			}, [props.workspaceId]);
			(0, react.useEffect)(() => {
				setState(INITIAL$2);
				reload();
			}, [reload]);
			const save = (0, react.useCallback)(async (current) => {
				if (current.name.trim().length === 0) {
					setState((prev) => ({
						...prev,
						error: "角色卡需要名称"
					}));
					return;
				}
				setState((prev) => ({
					...prev,
					saving: true,
					error: null,
					notice: null
				}));
				try {
					const saved = await writeCard(props.workspaceId, current.id === null ? "create" : "save", current.id, current);
					setDraft(draftOf(saved));
					setConfirmDelete(null);
					await reload("已保存角色卡");
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$6(cause)
					}));
				}
			}, [props.workspaceId, reload]);
			const remove = (0, react.useCallback)(async (id) => {
				if (confirmDelete !== id) {
					setConfirmDelete(id);
					return;
				}
				setState((prev) => ({
					...prev,
					saving: true,
					error: null,
					notice: null
				}));
				try {
					await removeCard(props.workspaceId, id);
					setConfirmDelete(null);
					setDraft(null);
					await reload("已删除角色卡");
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$6(cause)
					}));
				}
			}, [
				confirmDelete,
				props.workspaceId,
				reload
			]);
			const importCard = (0, react.useCallback)(async () => {
				setState((prev) => ({
					...prev,
					error: null,
					notice: null
				}));
				let picked;
				try {
					picked = await pickTextFile(".charc,application/json");
				} catch (cause) {
					setState((prev) => ({
						...prev,
						error: errorText$6(cause)
					}));
					return;
				}
				if (picked === void 0) return;
				setState((prev) => ({
					...prev,
					saving: true
				}));
				try {
					const card = await importCharacterCard(props.workspaceId, picked.text);
					await reload(`已导入角色卡「${card.name}」`);
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$6(cause)
					}));
				}
			}, [props.workspaceId, reload]);
			const exportCard = (0, react.useCallback)(async (id) => {
				setState((prev) => ({
					...prev,
					error: null,
					notice: null
				}));
				try {
					downloadDocument(await exportCharacterCard(props.workspaceId, id));
					setState((prev) => ({
						...prev,
						notice: "已导出角色卡"
					}));
				} catch (cause) {
					setState((prev) => ({
						...prev,
						error: errorText$6(cause)
					}));
				}
			}, [props.workspaceId]);
			const update = (patch) => {
				setDraft((current) => current === null ? null : {
					...current,
					...patch
				});
			};
			const selectedId = draft?.id ?? null;
			const editorEnabled = draft !== null && !state.saving && draft.name.trim().length > 0;
			return (0, react.createElement)("section", { className: "dshtavern-character-panel" }, (0, react.createElement)("aside", { className: "dshtavern-character-sidebar" }, (0, react.createElement)("div", { className: "dshtavern-character-side-head" }, (0, react.createElement)("div", { className: "dshtavern-character-side-title" }, (0, react.createElement)("span", { className: "dshtavern-character-heading" }, "角色卡"), (0, react.createElement)("span", { className: "dshtavern-character-count" }, String(state.cards.length))), (0, react.createElement)("div", { className: "dshtavern-character-side-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-character-new",
				disabled: state.saving,
				title: "从 .charc 文件导入角色卡",
				onClick: () => {
					importCard();
				}
			}, "导入"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary dshtavern-character-new",
				onClick: () => {
					setDraft(NEW_DRAFT);
					setConfirmDelete(null);
				}
			}, "新建"))), (0, react.createElement)("div", { className: "dshtavern-character-list" }, state.loading ? (0, react.createElement)("div", { className: "dshtavern-character-empty" }, "加载中…") : state.cards.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-character-empty" }, "还没有角色卡。点「新建」创建第一张。") : state.cards.map((card) => (0, react.createElement)("button", {
				key: card.id,
				type: "button",
				className: "dshtavern-character-row",
				"data-selected": selectedId === card.id,
				onClick: () => {
					setDraft(draftOf(card));
					setConfirmDelete(null);
				}
			}, (0, react.createElement)("span", {
				className: "dshtavern-character-avatar",
				"aria-hidden": true
			}, card.name.slice(0, 1)), (0, react.createElement)("span", { className: "dshtavern-character-row-main" }, (0, react.createElement)("span", { className: "dshtavern-character-name" }, card.name), (0, react.createElement)("span", { className: "dshtavern-character-meta" }, `${card.tags.join(" · ") || "无标签"} · ${card.updatedAt.replace("T", " ").slice(0, 16)}`))))), state.problems.length === 0 ? null : (0, react.createElement)("div", { className: "dshtavern-character-problems" }, (0, react.createElement)("div", { className: "dshtavern-character-label" }, "无法读取的文件"), state.problems.map((problem) => (0, react.createElement)("div", {
				key: problem.file,
				className: "dshtavern-character-meta",
				title: problem.error
			}, problem.file)))), (0, react.createElement)("div", { className: "dshtavern-character-main" }, state.error === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-error" }, state.error), state.notice === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-notice" }, state.notice), draft === null ? (0, react.createElement)("div", { className: "dshtavern-character-placeholder" }, (0, react.createElement)("div", {
				className: "dshtavern-character-placeholder-glyph",
				"aria-hidden": true
			}, "卡"), (0, react.createElement)("div", { className: "dshtavern-character-placeholder-title" }, "还没有选中角色"), (0, react.createElement)("div", null, "从左侧选择一个角色卡，或点「新建」开始。"), (0, react.createElement)("div", { className: "dshtavern-character-hint-path" }, "characters/<id>.charc"), (0, react.createElement)("div", {
				className: "dshtavern-character-meta",
				title: props.workspacePath
			}, `保存在当前酒馆工作区（${props.workspaceTitle}）内`)) : (0, react.createElement)("div", { className: "dshtavern-character-editor" }, (0, react.createElement)("div", { className: "dshtavern-character-editor-head" }, (0, react.createElement)("span", {
				className: "dshtavern-character-editor-avatar",
				"aria-hidden": true
			}, draft.name.trim().slice(0, 1) || "?"), (0, react.createElement)("div", { className: "dshtavern-character-editor-title" }, (0, react.createElement)("div", { className: "dshtavern-character-heading" }, draft.id === null ? "新建角色卡" : draft.name || "未命名"), (0, react.createElement)("div", { className: "dshtavern-character-meta" }, draft.id === null ? "保存后写入 characters/<id>.charc" : `${draft.tags || "无标签"} · 更新 ${draft.updatedAt.replace("T", " ").slice(0, 16)}`)), (0, react.createElement)("div", { className: "dshtavern-character-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: !editorEnabled,
				onClick: () => {
					save(draft);
				}
			}, state.saving ? "保存中…" : "保存"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				onClick: () => {
					setDraft(null);
					setConfirmDelete(null);
				}
			}, "关闭"), draft.id === null ? null : (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled: state.saving,
				title: "导出为 .charc 文件",
				onClick: () => {
					exportCard(draft.id);
				}
			}, "导出"), draft.id === null ? null : (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-danger",
				disabled: state.saving,
				onClick: () => {
					remove(draft.id);
				}
			}, confirmDelete === draft.id ? "确认删除" : "删除"))), (0, react.createElement)("div", { className: "dshtavern-character-form" }, (0, react.createElement)("div", { className: "dshtavern-character-group" }, (0, react.createElement)("div", { className: "dshtavern-character-group-title" }, "基础"), (0, react.createElement)("div", { className: "dshtavern-character-grid" }, (0, react.createElement)(Field$2, {
				label: "名称",
				value: draft.name,
				placeholder: "角色名",
				onChange: (value) => update({ name: value })
			}), (0, react.createElement)(Field$2, {
				label: "标签（逗号分隔）",
				value: draft.tags,
				placeholder: "原创, 奇幻",
				onChange: (value) => update({ tags: value })
			}))), (0, react.createElement)("div", { className: "dshtavern-character-group" }, (0, react.createElement)("div", { className: "dshtavern-character-group-title" }, "角色设定"), (0, react.createElement)(Field$2, {
				label: "描述",
				value: draft.description,
				multiline: true,
				placeholder: "外貌、身份、背景",
				onChange: (value) => update({ description: value })
			}), (0, react.createElement)(Field$2, {
				label: "性格",
				value: draft.personality,
				multiline: true,
				onChange: (value) => update({ personality: value })
			}), (0, react.createElement)(Field$2, {
				label: "场景",
				value: draft.scenario,
				multiline: true,
				onChange: (value) => update({ scenario: value })
			})), (0, react.createElement)("div", { className: "dshtavern-character-group" }, (0, react.createElement)("div", { className: "dshtavern-character-group-title" }, "对话与提示"), (0, react.createElement)(Field$2, {
				label: "系统提示词（可选）",
				value: draft.systemPrompt,
				multiline: true,
				onChange: (value) => update({ systemPrompt: value })
			}), (0, react.createElement)(Field$2, {
				label: "示例对话",
				value: draft.exampleDialogues,
				multiline: true,
				placeholder: "<START>\n{{user}}: …\n{{char}}: …",
				onChange: (value) => update({ exampleDialogues: value })
			}), (0, react.createElement)(Field$2, {
				label: "开场白",
				value: draft.greeting,
				multiline: true,
				onChange: (value) => update({ greeting: value })
			}))))));
		}
		//#endregion
		//#region src/client/prompt.ts
		/**
		* Prompt orchestration UI for the session toolbox.
		*
		* The toolbox drawer renders this component for the current tavern workspace:
		* a drag-to-reorder list of the system-prompt blocks, an enable switch per
		* block, save-state feedback and a reset action. Order and flags persist
		* through `/tavern/prompt` on the Host half.
		*/
		/**
		* Map a drag among the rendered blocks onto the full stored ordering, so the
		* hidden character blocks keep their slots while the visible subset moves.
		* @param blocks - full stored ordering.
		* @param visible - rendered subset, in display order.
		* @param from - dragged index within `visible`.
		* @param to - target index within `visible`.
		* @returns a full ordering with the visible subset reordered.
		*/
		function reorderVisibleBlocks(blocks, visible, from, to) {
			if (from === to || from < 0 || to < 0 || from >= visible.length || to >= visible.length) return [...blocks];
			const visibleIds = new Set(visible.map((block) => block.id));
			const indices = blocks.flatMap((block, index) => visibleIds.has(block.id) ? [index] : []);
			const source = indices[from];
			const target = indices[to];
			if (source === void 0 || target === void 0) return [...blocks];
			const next = [...blocks];
			const [item] = next.splice(source, 1);
			if (item === void 0) return next;
			next.splice(target, 0, item);
			return next;
		}
		/** Human-facing badge for one prompt block source. */
		const SOURCE_LABELS = {
			template: "模板",
			character: "角色卡",
			worldbook: "世界书",
			persona: "人设",
			chat: "聊天",
			dsh: "DSH",
			director: "导演",
			state: "运行时"
		};
		/** Read failure as display text. */
		function errorText$5(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		/** Parse one JSON response from a tavern route. */
		async function readJsonResponse$1(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`酒馆接口不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("酒馆接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `酒馆请求失败（HTTP ${response.status}）`);
			return record;
		}
		/** Fetch one workspace's system-prompt assembly order. */
		async function fetchPromptLayout(workspaceId, scope = "character") {
			return await readJsonResponse$1(await fetch(`/tavern/prompt?workspaceId=${encodeURIComponent(workspaceId)}&scope=${scope}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
		}
		/** Persist a block order, or reset it to the catalogue default. */
		async function savePromptLayout(workspaceId, body, scope = "character") {
			return await readJsonResponse$1(await fetch("/tavern/prompt", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					scope,
					...body
				})
			}));
		}
		/** Short label for one visibility, shown beside a preview hit. */
		const VISIBILITY_SHORT = {
			all: "全体可见",
			director: "仅导演",
			characters: "指定角色"
		};
		/**
		* Load the persona choices one workspace offers.
		*
		* The persona library is workspace-scoped, so the picker offers exactly the
		* entries the persona workbench manages.
		* @param workspaceId - tavern workspace id.
		* @returns the selectable personas and the preset's name.
		*/
		async function fetchPersonaOptions(workspaceId) {
			const body = await readJsonResponse$1(await fetch(`/tavern/personas?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			const personas = Array.isArray(body.personas) ? body.personas.filter((item) => typeof item.id === "string" && typeof item.name === "string").map((item) => ({
				id: item.id,
				name: item.name
			})) : [];
			const activeId = typeof body.activeId === "string" ? body.activeId : void 0;
			const presetName = activeId === void 0 ? void 0 : personas.find((persona) => persona.id === activeId)?.name ?? personas[0]?.name;
			return {
				personas,
				...presetName === void 0 ? {} : { presetName }
			};
		}
		/**
		* Ask the host to assemble a prompt for inspection.
		*
		* The host runs the same builders the runtime uses, so the result is the request
		* the model would actually receive rather than a client-side approximation.
		* @param workspaceId - tavern workspace id.
		* @param scope - which prompt to assemble.
		* @param options - optional card selection, the sample line to scan, and the
		*   chat whose stage and world the preview should reflect.
		* @returns the assembled preview.
		*/
		async function fetchPromptPreview(workspaceId, scope, options = {}) {
			const params = new URLSearchParams({
				workspaceId,
				scope
			});
			if (options.cardId !== void 0) params.set("cardId", options.cardId);
			if (options.sessionId !== void 0) params.set("sessionId", options.sessionId);
			params.set("sample", options.sample ?? "");
			return await readJsonResponse$1(await fetch(`/tavern/preview?${params.toString()}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
		}
		/**
		* Render one prompt block card without state, so it is unit-testable.
		* @param props - block data, drag state, and callbacks.
		* @returns the card element.
		*/
		function PromptCardView(props) {
			const block = props.block;
			const className = [
				CLASS.promptCard,
				props.dragging ? "dshtavern-prompt-card-dragging" : "",
				props.over ? "dshtavern-prompt-card-over" : "",
				block.enabled ? "" : "dshtavern-prompt-card-off"
			].filter((part) => part.length > 0).join(" ");
			const canEdit = block.editable && !props.disabled;
			return (0, react.createElement)("div", {
				key: block.id,
				className,
				"data-source": block.source,
				"data-enabled": block.enabled,
				draggable: true,
				"aria-grabbed": props.dragging,
				onClick: canEdit ? props.onOpen : void 0,
				onDragStart: (event) => {
					if (event.dataTransfer !== void 0) {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", block.id);
					}
					props.onDragStart(props.index);
				},
				onDragOver: (event) => {
					event.preventDefault();
					props.onDragOver(props.index);
				},
				onDrop: (event) => {
					event.preventDefault();
					props.onDrop(props.index);
				},
				onDragEnd: () => props.onDragEnd()
			}, (0, react.createElement)("span", {
				key: "handle",
				className: CLASS.dragHandle,
				"aria-hidden": true
			}, "⠿"), (0, react.createElement)("span", {
				key: "index",
				className: CLASS.promptIndex
			}, String(props.index + 1)), (0, react.createElement)("div", {
				key: "main",
				className: CLASS.promptMain
			}, (0, react.createElement)("div", {
				key: "title",
				className: "dshtavern-prompt-title"
			}, (0, react.createElement)("span", { className: CLASS.promptName }, block.label), (0, react.createElement)("span", {
				className: CLASS.badge,
				"data-source": block.source
			}, SOURCE_LABELS[block.source]), block.enabled ? null : (0, react.createElement)("span", {
				key: "off",
				className: "dshtavern-pill",
				"data-tone": "muted"
			}, "已停用"), block.overridden ? (0, react.createElement)("span", {
				key: "mod",
				className: "dshtavern-pill",
				"data-tone": "ok"
			}, "已修改") : null), (0, react.createElement)("div", {
				key: "hint",
				className: CLASS.hint
			}, block.description), block.selectsPersona ? (0, react.createElement)("div", {
				key: "persona",
				className: "dshtavern-prompt-persona"
			}, (0, react.createElement)("select", {
				className: "dshtavern-wb-input",
				value: block.personaId ?? "",
				disabled: props.disabled,
				"aria-label": "选择人设",
				onClick: (event) => event.stopPropagation(),
				onChange: (event) => props.onPickPersona(event.target.value === "" ? void 0 : event.target.value)
			}, (0, react.createElement)("option", { value: "" }, props.presetName === void 0 ? "跟随预设人设" : `跟随预设：${props.presetName}`), props.personas.map((persona) => (0, react.createElement)("option", {
				key: persona.id,
				value: persona.id
			}, persona.name)))) : null), (0, react.createElement)("div", {
				key: "side",
				className: "dshtavern-prompt-side"
			}, (0, react.createElement)("span", {
				key: "chars",
				className: "dshtavern-prompt-chars",
				title: "这个块进入提示词的字数；运行时块在装配时才能确定"
			}, promptSizeLabel(block)), canEdit ? (0, react.createElement)("button", {
				key: "edit",
				type: "button",
				className: "dshtavern-prompt-edit",
				"aria-label": `编辑 ${block.label}`,
				onClick: (event) => {
					event.stopPropagation();
					props.onOpen();
				}
			}, "编辑") : null), (0, react.createElement)("label", {
				key: "switch",
				className: "dshtavern-switch",
				title: block.enabled ? "已启用" : "已停用",
				onClick: (event) => event.stopPropagation()
			}, (0, react.createElement)("input", {
				type: "checkbox",
				checked: block.enabled,
				disabled: props.disabled,
				onChange: () => props.onToggle(block.id)
			}), (0, react.createElement)("span", {
				className: "dshtavern-switch-track",
				"aria-hidden": true
			}, (0, react.createElement)("span", { className: "dshtavern-switch-thumb" }))));
		}
		/**
		* Character cost of one block, as shown on its card.
		*
		* Card-sourced and runtime blocks carry no stored text: their content is filled
		* while a request is assembled, so a character count would be a lie.
		* @param block - the block to measure.
		* @returns a compact size label.
		*/
		function promptSizeLabel(block) {
			const chars = block.content.trim().length;
			if (chars === 0) return "运行时";
			if (chars < 1e3) return `${chars} 字`;
			return `${(chars / 1e3).toFixed(1)}k 字`;
		}
		/**
		* Floating dialog that edits one block's prompt text.
		* @param props - block, draft text, and editor actions.
		* @returns the dialog element.
		*/
		function PromptEditorDialog(props) {
			return (0, react.createElement)("div", {
				className: "dshtavern-editor-layer",
				onClick: (event) => {
					if (event.target === event.currentTarget) props.onCancel();
				}
			}, (0, react.createElement)("section", {
				className: "dshtavern-editor-dialog",
				role: "dialog",
				"aria-label": props.block.label
			}, (0, react.createElement)("header", { className: "dshtavern-editor-head" }, (0, react.createElement)("div", { style: {
				flex: 1,
				minWidth: 0
			} }, (0, react.createElement)("div", { className: "dshtavern-editor-title" }, props.block.label), (0, react.createElement)("div", { className: "dshtavern-editor-sub" }, props.block.description)), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-window-close",
				title: "关闭",
				"aria-label": "关闭",
				onClick: props.onCancel
			}, "✕")), (0, react.createElement)("textarea", {
				className: "dshtavern-editor-textarea",
				value: props.draft,
				rows: 10,
				autoFocus: true,
				spellCheck: false,
				placeholder: "输入这个提示词块的具体内容；支持 {{char}} / {{user}} 等占位符",
				onChange: (event) => props.onDraftChange(event.target.value),
				onKeyDown: (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					props.onCancel();
				}
			}), (0, react.createElement)("footer", { className: "dshtavern-editor-actions" }, (0, react.createElement)("span", { className: CLASS.hint }, `${props.draft.length} 字符`), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				onClick: props.onResetContent
			}, "恢复默认文本"), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				onClick: props.onCancel
			}, "取消"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: props.disabled,
				onClick: props.onSave
			}, "保存"))));
		}
		/**
		* Load, edit, and persist one tavern workspace's system-prompt order.
		* @param props - the workspace the toolbox opened for.
		* @returns the orchestration section.
		*/
		function PromptOrchestration(props) {
			const [blocks, setBlocks] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [savedAt, setSavedAt] = (0, react.useState)(null);
			const [hasCharacterCard, setHasCharacterCard] = (0, react.useState)(true);
			const [dragFrom, setDragFrom] = (0, react.useState)(null);
			const [dragOver, setDragOver] = (0, react.useState)(null);
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)("");
			const [scope, setScope] = (0, react.useState)("character");
			const [previewOpen, setPreviewOpen] = (0, react.useState)(false);
			const [previewSample, setPreviewSample] = (0, react.useState)("");
			const [previewCardId, setPreviewCardId] = (0, react.useState)(void 0);
			const [preview, setPreview] = (0, react.useState)(null);
			const [previewLoading, setPreviewLoading] = (0, react.useState)(false);
			const [previewError, setPreviewError] = (0, react.useState)(null);
			const [personas, setPersonas] = (0, react.useState)([]);
			const [presetPersonaName, setPresetPersonaName] = (0, react.useState)(void 0);
			const [previewCards, setPreviewCards] = (0, react.useState)([]);
			const [cardsError, setCardsError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!previewOpen || scope !== "character") return;
				let cancelled = false;
				fetchCharacterCards(props.workspaceId).then((cards) => {
					if (cancelled) return;
					setPreviewCards(cards.map((card) => ({
						id: card.id,
						name: card.name
					})));
					setCardsError(null);
					setPreviewCardId((current) => current !== void 0 && cards.some((card) => card.id === current) ? current : cards[0]?.id);
				}).catch((cause) => {
					if (cancelled) return;
					setCardsError(errorText$5(cause));
				});
				return () => {
					cancelled = true;
				};
			}, [
				previewOpen,
				props.workspaceId,
				scope
			]);
			const runPreview = (0, react.useCallback)(async () => {
				setPreviewLoading(true);
				setPreviewError(null);
				try {
					const next = await fetchPromptPreview(props.workspaceId, scope, {
						...previewCardId === void 0 ? {} : { cardId: previewCardId },
						...props.sessionId === void 0 ? {} : { sessionId: props.sessionId },
						sample: previewSample
					});
					setPreview(next);
				} catch (cause) {
					setPreviewError(errorText$5(cause));
				} finally {
					setPreviewLoading(false);
				}
			}, [
				props.workspaceId,
				props.sessionId,
				scope,
				previewCardId,
				previewSample
			]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setLoading(true);
				setError(null);
				setNotice(null);
				setBlocks([]);
				fetchPersonaOptions(props.workspaceId).then((options) => {
					if (cancelled) return;
					setPersonas(options.personas);
					setPresetPersonaName(options.presetName);
				}).catch(() => void 0);
				fetchPromptLayout(props.workspaceId, scope).then((layout) => {
					if (cancelled) return;
					setBlocks(layout.blocks);
					setHasCharacterCard(layout.hasCharacterCard !== false);
					setSavedAt(layout.savedAt ?? null);
					setLoading(false);
				}).catch((cause) => {
					if (cancelled) return;
					setError(errorText$5(cause));
					setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [props.workspaceId, scope]);
			const persist = (0, react.useCallback)(async (next, reset = false) => {
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const layout = await savePromptLayout(props.workspaceId, reset ? { reset: true } : { blocks: next.map((block) => ({
						id: block.id,
						enabled: block.enabled,
						content: block.content
					})) }, scope);
					setBlocks(layout.blocks);
					setSavedAt(layout.savedAt ?? null);
					setNotice(reset ? "已恢复默认顺序" : "已保存顺序");
				} catch (cause) {
					setError(errorText$5(cause));
				} finally {
					setSaving(false);
					setDragFrom(null);
					setDragOver(null);
				}
			}, [props.workspaceId, scope]);
			const pickPersona = (0, react.useCallback)(async (blockId, personaId) => {
				const next = blocks.map((block) => block.id === blockId ? {
					...block,
					personaId
				} : block);
				setBlocks(next);
				setSaving(true);
				setError(null);
				try {
					const layout = await savePromptLayout(props.workspaceId, { blocks: next.map((block) => ({
						id: block.id,
						enabled: block.enabled,
						content: block.content,
						...block.personaId === void 0 ? {} : { personaId: block.personaId }
					})) }, scope);
					setBlocks(layout.blocks);
					setSavedAt(layout.savedAt ?? null);
					setNotice(personaId === void 0 ? "已改为跟随预设人设" : "已选择人设");
				} catch (cause) {
					setError(errorText$5(cause));
				} finally {
					setSaving(false);
				}
			}, [
				blocks,
				props.workspaceId,
				scope
			]);
			const onDragStart = (0, react.useCallback)((index) => {
				setDragFrom(index);
				setDragOver(index);
			}, []);
			const onDragOver = (0, react.useCallback)((index) => {
				setDragOver((current) => current === index ? current : index);
			}, []);
			const onDrop = (0, react.useCallback)((target) => {
				setBlocks((current) => {
					if (dragFrom === null || dragFrom === target) return current;
					const next = reorderVisibleBlocks(current, hasCharacterCard ? current : current.filter((block) => block.source !== "character"), dragFrom, target);
					persist(next);
					return next;
				});
				setDragFrom(null);
				setDragOver(null);
			}, [
				dragFrom,
				hasCharacterCard,
				persist
			]);
			const onToggle = (0, react.useCallback)((id) => {
				setBlocks((current) => {
					const next = current.map((block) => block.id === id ? {
						...block,
						enabled: !block.enabled
					} : block);
					persist(next);
					return next;
				});
			}, [persist]);
			const onOpenEditor = (0, react.useCallback)((block) => {
				if (!block.editable) return;
				setEditingId(block.id);
				setDraft(block.content);
			}, []);
			const onSaveEditor = (0, react.useCallback)(() => {
				const id = editingId;
				if (id === null) return;
				setBlocks((current) => {
					const next = current.map((block) => block.id === id ? {
						...block,
						content: draft,
						overridden: draft !== block.defaultContent
					} : block);
					persist(next);
					return next;
				});
				setEditingId(null);
			}, [
				draft,
				editingId,
				persist
			]);
			const onResetContent = (0, react.useCallback)(() => {
				const block = blocks.find((item) => item.id === editingId);
				if (block === void 0) return;
				setDraft(block.defaultContent);
			}, [blocks, editingId]);
			const status = saving ? "保存中…" : savedAt === null ? "尚未保存（默认顺序）" : `已保存 ${savedAt.replace("T", " ").slice(0, 19)}`;
			const visibleBlocks = scope === "character" && !hasCharacterCard ? blocks.filter((block) => block.source !== "character") : blocks;
			const editingBlock = editingId === null ? null : blocks.find((block) => block.id === editingId) ?? null;
			const previewMeta = preview === null ? null : (0, react.createElement)("div", { className: "dshtavern-preview-meta" }, (0, react.createElement)("span", { className: "dshtavern-pill" }, preview.scope === "director" ? "导演提示词" : `角色：${preview.cardName ?? "—"}`), (0, react.createElement)("span", { className: "dshtavern-pill" }, `${preview.system.length} 字符`), (0, react.createElement)("span", { className: "dshtavern-pill" }, `世界书 ${preview.lore.length} 条 / ${preview.loreChars} 字`));
			const previewLore = preview === null ? null : preview.lore.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, "这段测试台词没有激活任何世界书条目。") : (0, react.createElement)("div", { className: "dshtavern-preview-lore" }, preview.lore.map((hit) => (0, react.createElement)("span", {
				key: hit.id,
				className: "dshtavern-preview-lore-chip",
				"data-audience": hit.visibility
			}, hit.name, (0, react.createElement)("span", { className: "dshtavern-preview-lore-meta" }, ` · ${VISIBILITY_SHORT[hit.visibility]}`))));
			const previewBody = preview === null ? (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, "点「生成预览」查看最终 system。世界书条目会按测试台词命中。") : (0, react.createElement)("div", { className: "dshtavern-preview-body" }, previewMeta, previewLore, (0, react.createElement)("pre", { className: "dshtavern-preview-system" }, preview.system));
			const previewControls = (0, react.createElement)("div", { className: "dshtavern-preview-controls" }, scope === "character" ? (0, react.createElement)("label", { className: "dshtavern-wb-field" }, (0, react.createElement)("span", { className: "dshtavern-wb-label" }, "角色卡"), previewCards.length === 0 ? (0, react.createElement)("select", {
				className: "dshtavern-wb-input",
				disabled: true
			}, (0, react.createElement)("option", { value: "" }, cardsError === null ? "（没有角色卡）" : "（读取失败）")) : (0, react.createElement)("select", {
				className: "dshtavern-wb-input",
				value: previewCardId ?? "",
				onChange: (event) => {
					setPreviewCardId(event.target.value === "" ? void 0 : event.target.value);
					setPreview(null);
				}
			}, ...previewCards.map((card) => (0, react.createElement)("option", {
				key: card.id,
				value: card.id
			}, card.name))), cardsError === null ? null : (0, react.createElement)("span", { className: "dshtavern-wb-hint" }, cardsError)) : null, (0, react.createElement)("label", { className: "dshtavern-wb-field dshtavern-preview-sample" }, (0, react.createElement)("span", { className: "dshtavern-wb-label" }, "测试台词（用于触发世界书）"), (0, react.createElement)("input", {
				className: "dshtavern-wb-input",
				value: previewSample,
				placeholder: "例如：我看向她手腕上那条缎带",
				onChange: (event) => setPreviewSample(event.target.value)
			})), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: previewLoading,
				onClick: () => {
					runPreview();
				}
			}, previewLoading ? "装配中…" : "生成预览"));
			const previewPane = previewOpen ? (0, react.createElement)("div", { className: "dshtavern-preview" }, (0, react.createElement)("div", { className: "dshtavern-preview-head" }, (0, react.createElement)("span", { className: "dshtavern-wb-label" }, "装配预览"), (0, react.createElement)("span", { className: "dshtavern-wb-hint" }, "调用宿主真实的装配函数，结果与模型收到的 system 一致。"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-window-close",
				title: "关闭预览",
				"aria-label": "关闭预览",
				onClick: () => setPreviewOpen(false)
			}, "✕")), previewControls, previewError === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-error" }, previewError), previewBody) : null;
			return (0, react.createElement)("section", { className: "dshtavern-prompt-panel" }, (0, react.createElement)("div", {
				className: "dshtavern-scope-switch",
				role: "tablist",
				"aria-label": "编排对象"
			}, [{
				id: "character",
				label: "角色提示词",
				hint: "每个角色各自的卡与舞台"
			}, {
				id: "director",
				label: "导演台",
				hint: "旁白、节奏与调度规则"
			}].map((entry) => (0, react.createElement)("button", {
				key: entry.id,
				type: "button",
				role: "tab",
				"aria-selected": scope === entry.id,
				className: "dshtavern-scope-option",
				"data-active": scope === entry.id,
				disabled: saving,
				onClick: () => setScope(entry.id)
			}, (0, react.createElement)("span", { className: "dshtavern-scope-name" }, entry.label), (0, react.createElement)("span", { className: "dshtavern-scope-hint" }, entry.hint)))), (0, react.createElement)("div", { className: "dshtavern-prompt-toolbar" }, (0, react.createElement)("div", { className: CLASS.hint }, scope === "director" ? "导演决定旁白与谁接话。拖动调整顺序；停用的块不会进入导演的请求。" : "拖动卡片调整系统提示词的拼装顺序；停用的块不会进入请求。" + (hasCharacterCard ? "" : "（未导入角色卡，角色卡相关块已隐藏）")), (0, react.createElement)("span", {
				className: "dshtavern-pill",
				"data-tone": saving ? "busy" : void 0
			}, status), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				"data-active": previewOpen,
				onClick: () => setPreviewOpen((open) => !open)
			}, previewOpen ? "收起预览" : "预览"), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				disabled: loading || saving,
				onClick: () => {
					persist(blocks, true);
				}
			}, "恢复默认")), error === null ? null : (0, react.createElement)("div", { className: CLASS.bannerError }, error), notice === null ? null : (0, react.createElement)("div", { className: CLASS.bannerNotice }, notice), previewPane, loading ? (0, react.createElement)("div", {
				className: CLASS.hint,
				style: { padding: "4px 2px" }
			}, "加载中…") : (0, react.createElement)("div", { className: CLASS.promptList }, visibleBlocks.map((block, index) => (0, react.createElement)(PromptCardView, {
				key: block.id,
				block,
				index,
				dragging: dragFrom === index,
				over: dragOver === index && dragFrom !== index,
				disabled: saving,
				onDragStart,
				onDragOver,
				onDrop,
				onDragEnd: () => {
					setDragFrom(null);
					setDragOver(null);
				},
				onToggle,
				onOpen: () => onOpenEditor(block),
				personas,
				...presetPersonaName === void 0 ? {} : { presetName: presetPersonaName },
				onPickPersona: (id) => {
					pickPersona(block.id, id);
				}
			}))), editingBlock === null ? null : (0, react.createElement)(PromptEditorDialog, {
				block: editingBlock,
				draft,
				disabled: saving,
				onDraftChange: setDraft,
				onSave: onSaveEditor,
				onCancel: () => setEditingId(null),
				onResetContent
			}));
		}
		//#endregion
		//#region src/client/sub-tabs.ts
		/**
		* Sub-page strip shared by the tool panels.
		*
		* A tool with more settings than fit on one screen splits them behind this
		* strip instead of one long scroll: the strip stays put, the pane below it
		* scrolls, and every page is reachable in one click.
		*/
		/**
		* Render the tab strip.
		* @param props - the tabs and which one is open.
		* @returns the strip, with the active tab underlined in the accent.
		*/
		function SubTabs(props) {
			return (0, react.createElement)("div", {
				className: "dshtavern-subtabs",
				role: "tablist",
				"aria-label": props.ariaLabel
			}, props.tabs.map((tab) => (0, react.createElement)("button", {
				key: tab.id,
				type: "button",
				role: "tab",
				"aria-selected": props.active === tab.id,
				"data-active": props.active === tab.id,
				className: "dshtavern-subtab",
				disabled: tab.disabled === true,
				title: tab.hint,
				onClick: () => props.onSelect(tab.id)
			}, (0, react.createElement)("span", { className: "dshtavern-subtab-label" }, tab.label), tab.changed === true ? (0, react.createElement)("span", {
				className: "dshtavern-subtab-changed",
				"aria-label": "有未保存的修改"
			}, "●") : null)));
		}
		/**
		* Wrap the open page so it owns the leftover height and scrolls itself.
		* @param props - the page content.
		* @returns the scrolling pane.
		*/
		function SubTabPane(props) {
			return (0, react.createElement)("div", {
				className: "dshtavern-subtabs-pane",
				role: "tabpanel"
			}, props.children);
		}
		//#endregion
		//#region src/client/agent.ts
		/**
		* Agent orchestration panel for the tavern toolbox.
		*
		* Prompt orchestration decides what a model reads; this panel decides how a
		* beat runs: how many characters may speak, how much history and lore each call
		* carries, whether speakers rotate, who answers when the director's pick cannot
		* be resolved, and which model each role uses.
		*/
		/** Inclusive bounds, mirrored from the host so the inputs can clamp in place. */
		const AGENT_LIMITS = {
			maxSpeechesPerBeat: {
				min: 1,
				max: 6,
				step: 1,
				unit: "个角色"
			},
			stageWindow: {
				min: 4,
				max: 2e3,
				step: 10,
				unit: "行"
			},
			stageMaxChars: {
				min: 1e3,
				max: 4e5,
				step: 1e3,
				unit: "字"
			},
			loreScanLines: {
				min: 4,
				max: 2e3,
				step: 10,
				unit: "行"
			},
			loreMaxEntries: {
				min: 1,
				max: 200,
				step: 1,
				unit: "条"
			},
			loreMaxChars: {
				min: 200,
				max: 4e5,
				step: 1e3,
				unit: "字"
			},
			playerInputMax: {
				min: 200,
				max: 12e4,
				step: 1e3,
				unit: "字"
			},
			maxReplyChars: {
				min: 20,
				max: 8e3,
				step: 20,
				unit: "字"
			},
			reasoningReserveTokens: {
				min: 0,
				max: 16e3,
				step: 64,
				unit: "token"
			}
		};
		/**
		* Context budget presets, mirrored from the host.
		*
		* The shipped defaults were sized for a small window; these scale up to what a
		* 1M-token context can actually use.
		*/
		const CONTEXT_PRESETS = {
			compact: {
				label: "精简",
				stageWindow: 40,
				loreScanLines: 20,
				loreMaxEntries: 8,
				loreMaxChars: 6e3,
				playerInputMax: 8e3
			},
			standard: {
				label: "标准",
				stageWindow: 200,
				loreScanLines: 60,
				loreMaxEntries: 24,
				loreMaxChars: 4e4,
				playerInputMax: 2e4
			},
			roomy: {
				label: "充裕",
				stageWindow: 800,
				loreScanLines: 200,
				loreMaxEntries: 80,
				loreMaxChars: 16e4,
				playerInputMax: 6e4
			},
			extreme: {
				label: "极限",
				stageWindow: 2e3,
				loreScanLines: 500,
				loreMaxEntries: 200,
				loreMaxChars: 4e5,
				playerInputMax: 12e4
			}
		};
		/**
		* Which preset a config currently matches.
		* @param config - current settings.
		* @returns the preset id, or `undefined` for a custom mix.
		*/
		function contextPresetOf(config) {
			for (const [id, preset] of Object.entries(CONTEXT_PRESETS)) if (preset.stageWindow === config.stageWindow && preset.loreScanLines === config.loreScanLines && preset.loreMaxEntries === config.loreMaxEntries && preset.loreMaxChars === config.loreMaxChars && preset.playerInputMax === config.playerInputMax) return id;
		}
		function errorText$4(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		async function readJson$3(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`酒馆接口不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("酒馆接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `酒馆请求失败（HTTP ${response.status}）`);
			return record;
		}
		/** Read one workspace's agent settings. */
		async function fetchAgentConfig(workspaceId) {
			return await readJson$3(await fetch(`/tavern/agent?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
		}
		/** Persist one workspace's agent settings, or reset them to the defaults. */
		async function saveAgentConfig(workspaceId, body) {
			return await readJson$3(await fetch("/tavern/agent", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					...body
				})
			}));
		}
		/** Read the provider/model catalog for the model pickers. */
		async function fetchModelCatalog() {
			const body = await readJson$3(await fetch("/tavern/models", {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			return Array.isArray(body.providers) ? body.providers : [];
		}
		/** One labelled number input with its bounds made visible. */
		function NumberRow$1(props) {
			const bounds = AGENT_LIMITS[props.field];
			const changed = props.value !== props.defaultValue;
			return (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, props.label, changed ? (0, react.createElement)("span", { className: "dshtavern-agent-changed" }, "·已改") : null), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, props.hint)), (0, react.createElement)("span", { className: "dshtavern-agent-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-agent-input",
				type: "number",
				min: bounds.min,
				max: bounds.max,
				step: bounds.step,
				value: String(props.value),
				disabled: props.disabled,
				onChange: (event) => {
					const parsed = Number(event.target.value);
					if (!Number.isFinite(parsed)) return;
					props.onChange(Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))));
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, bounds.unit), (0, react.createElement)("span", { className: "dshtavern-agent-range" }, `${bounds.min}–${bounds.max}`)));
		}
		/** One labelled switch. */
		function ToggleRow(props) {
			return (0, react.createElement)("label", { className: "dshtavern-agent-row dshtavern-agent-row-toggle" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, props.label), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, props.hint)), (0, react.createElement)("span", { className: "dshtavern-switch" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: props.checked,
				disabled: props.disabled,
				onChange: () => props.onChange(!props.checked)
			}), (0, react.createElement)("span", {
				className: "dshtavern-switch-track",
				"aria-hidden": true
			}, (0, react.createElement)("span", { className: "dshtavern-switch-thumb" }))));
		}
		/**
		* Pick the provider and model one role uses.
		*
		* An unset choice means "follow the session", which is the pre-existing
		* behaviour; the picker keeps that as an explicit option rather than silently
		* pre-filling the session's current route.
		*/
		function ModelPicker(props) {
			const providers = props.catalog;
			const models = providers.find((entry) => entry.provider === props.choice?.provider)?.models ?? [];
			return (0, react.createElement)("div", { className: "dshtavern-agent-model" }, (0, react.createElement)("div", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, props.label), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, props.hint)), (0, react.createElement)("div", { className: "dshtavern-agent-model-line" }, (0, react.createElement)("select", {
				className: "dshtavern-agent-select",
				value: props.choice?.provider ?? "",
				disabled: props.disabled || providers.length === 0,
				onChange: (event) => {
					const provider = event.target.value;
					if (provider.length === 0) {
						props.onChange(void 0);
						return;
					}
					const first = providers.find((entry) => entry.provider === provider)?.models[0];
					props.onChange(first === void 0 ? void 0 : {
						provider,
						model: first.id
					});
				}
			}, (0, react.createElement)("option", { value: "" }, providers.length === 0 ? "（无可用供应商）" : "跟随会话"), providers.map((entry) => (0, react.createElement)("option", {
				key: entry.provider,
				value: entry.provider
			}, entry.name))), (0, react.createElement)("select", {
				className: "dshtavern-agent-select",
				value: props.choice?.model ?? "",
				disabled: props.disabled || props.choice === void 0 || models.length === 0,
				onChange: (event) => {
					if (props.choice === void 0) return;
					const model = event.target.value;
					if (model.length === 0) {
						props.onChange(void 0);
						return;
					}
					props.onChange({
						provider: props.choice.provider,
						model,
						...props.choice.reasoningEffort === void 0 ? {} : { reasoningEffort: props.choice.reasoningEffort }
					});
				}
			}, props.choice === void 0 ? (0, react.createElement)("option", { value: "" }, "—") : models.length === 0 ? (0, react.createElement)("option", { value: "" }, props.choice.model) : models.map((model) => (0, react.createElement)("option", {
				key: model.id,
				value: model.id
			}, model.name)))), props.choice === void 0 ? null : (0, react.createElement)("div", { className: "dshtavern-agent-model-line" }, (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "推理等级"), (0, react.createElement)("input", {
				className: "dshtavern-agent-input dshtavern-agent-effort",
				value: props.choice.reasoningEffort ?? "",
				placeholder: "留空跟随会话",
				disabled: props.disabled,
				onChange: (event) => {
					const effort = event.target.value.trim();
					props.onChange({
						provider: props.choice.provider,
						model: props.choice.model,
						...effort.length === 0 ? {} : { reasoningEffort: effort }
					});
				}
			})));
		}
		/**
		* The panel's sub-pages.
		*
		* Every setting belongs to exactly one page, so the strip doubles as a table of
		* contents and a reader never scrolls past settings they did not open it for.
		* `fields` drives the unsaved-edit dot on each tab.
		*/
		const AGENT_TABS = [
			{
				id: "beat",
				label: "这一幕",
				hint: "一次玩家输入里，谁开口、说多久",
				fields: [
					"maxSpeechesPerBeat",
					"rotateSpeakers",
					"honorPlayerMention",
					"unknownSpeaker"
				]
			},
			{
				id: "context",
				label: "上下文",
				hint: "每次模型调用带多少历史与设定",
				fields: [
					"stageWindow",
					"stageMaxChars",
					"loreScanLines",
					"loreMaxEntries",
					"loreMaxChars",
					"playerInputMax"
				]
			},
			{
				id: "models",
				label: "模型",
				hint: "导演与角色各用哪个模型",
				fields: ["directorModel", "characterModel"]
			},
			{
				id: "reply",
				label: "回复长度",
				hint: "每次回复的字数上限",
				fields: [
					"maxReplyChars",
					"directorMaxReplyChars",
					"characterMaxReplyChars",
					"reasoningReserveTokens"
				]
			}
		];
		/**
		* Order-independent serialization for settings comparison.
		*
		* `characterMaxReplyChars` is a record, so plain `JSON.stringify` would report
		* an edit whenever the same entries come back in a different key order.
		*/
		function canonical(value) {
			if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
			if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
			return value === void 0 ? "null" : JSON.stringify(value);
		}
		/**
		* Whether two settings are equivalent.
		* @param left - one config.
		* @param right - the other config.
		* @returns whether every setting matches, ignoring record key order.
		*/
		function agentConfigEqual(left, right) {
			return canonical(left) === canonical(right);
		}
		/**
		* Whether one sub-page holds edits that are not persisted yet.
		* @param config - the edited config.
		* @param saved - the last persisted config.
		* @param fields - the sub-page's fields.
		* @returns whether any of those fields differ from the persisted value.
		*/
		function agentTabChanged(config, saved, fields) {
			return fields.some((field) => canonical(config[field]) !== canonical(saved[field]));
		}
		/**
		* Edit one workspace's agent orchestration settings.
		* @param props - the workspace the toolbox opened for.
		* @returns the settings panel.
		*/
		function AgentPanel(props) {
			const [config, setConfig] = (0, react.useState)(null);
			/** Last persisted config; `config` differing from this means unsaved edits. */
			const [saved, setSaved] = (0, react.useState)(null);
			const [defaults, setDefaults] = (0, react.useState)(null);
			const [catalog, setCatalog] = (0, react.useState)([]);
			/** Cards in this workspace, for the per-character reply budgets. */
			const [characters, setCharacters] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [activeTab, setActiveTab] = (0, react.useState)("beat");
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(null);
				try {
					const [snapshot, providers, cards] = await Promise.all([
						fetchAgentConfig(props.workspaceId),
						fetchModelCatalog().catch(() => []),
						fetchCharacterCards(props.workspaceId).catch(() => [])
					]);
					setConfig(snapshot.config);
					setSaved(snapshot.config);
					setDefaults(snapshot.defaults);
					setCatalog(providers);
					setCharacters(cards.map((card) => ({
						id: card.id,
						name: card.name
					})));
				} catch (cause) {
					setError(errorText$4(cause));
				} finally {
					setLoading(false);
				}
			}, [props.workspaceId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const persist = (0, react.useCallback)(async (next, reset = false) => {
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const snapshot = await saveAgentConfig(props.workspaceId, reset ? { reset: true } : { config: next });
					setConfig(snapshot.config);
					setSaved(snapshot.config);
					setDefaults(snapshot.defaults);
					setNotice(reset ? "已恢复默认" : "已保存");
				} catch (cause) {
					setError(errorText$4(cause));
				} finally {
					setSaving(false);
				}
			}, [props.workspaceId]);
			const update = (0, react.useCallback)((patch) => {
				setConfig((current) => current === null ? null : {
					...current,
					...patch
				});
			}, []);
			if (loading) return (0, react.createElement)("section", { className: "dshtavern-agent" }, (0, react.createElement)("div", {
				className: CLASS.hint,
				style: { padding: "10px 2px" }
			}, "读取 Agent 编排…"));
			if (config === null || defaults === null || saved === null) return (0, react.createElement)("section", { className: "dshtavern-agent" }, (0, react.createElement)("div", { className: CLASS.bannerError }, error ?? "无法读取 Agent 编排"), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				onClick: () => {
					load();
				}
			}, "重试"));
			const dirty = !agentConfigEqual(config, saved);
			const differsFromDefault = !agentConfigEqual(config, defaults);
			const disabled = saving;
			const num = (field, label, hint) => (0, react.createElement)(NumberRow$1, {
				key: field,
				field,
				label,
				hint,
				value: config[field],
				defaultValue: saved[field],
				disabled,
				onChange: (value) => update({ [field]: value })
			});
			const activePreset = contextPresetOf(config);
			const beatPane = (0, react.createElement)(SubTabPane, null, (0, react.createElement)("div", { className: "dshtavern-agent-group" }, (0, react.createElement)("div", { className: "dshtavern-agent-group-note" }, "一次玩家输入算一幕。这里决定这一幕里谁开口，以及话头什么时候交回玩家。"), num("maxSpeechesPerBeat", "每幕最多发言角色数", "一次玩家输入最多让几个角色开口；到上限就把话头交回玩家。"), (0, react.createElement)(ToggleRow, {
				label: "轮换发言",
				hint: "提示导演避免让同一个角色连着说；关掉后导演可自行决定。",
				checked: config.rotateSpeakers,
				disabled,
				onChange: (value) => update({ rotateSpeakers: value })
			}), (0, react.createElement)(ToggleRow, {
				label: "玩家点名优先",
				hint: "玩家在输入里直接叫了某个角色的名字时，由该角色回应，优先于导演的选择。",
				checked: config.honorPlayerMention,
				disabled,
				onChange: (value) => update({ honorPlayerMention: value })
			}), (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "说话人无法解析时"), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "导演给的名字不在名册里时：直接结束这一幕，或让第一个角色接话。")), (0, react.createElement)("select", {
				className: "dshtavern-agent-select dshtavern-agent-select-inline",
				value: config.unknownSpeaker,
				disabled,
				onChange: (event) => update({ unknownSpeaker: event.target.value === "first" ? "first" : "none" })
			}, (0, react.createElement)("option", { value: "none" }, "结束这一幕"), (0, react.createElement)("option", { value: "first" }, "第一个角色顶替")))));
			const contextPane = (0, react.createElement)(SubTabPane, null, (0, react.createElement)("div", { className: "dshtavern-agent-group" }, (0, react.createElement)("div", { className: "dshtavern-agent-group-note" }, "这些值决定每次模型调用带上多少历史与设定。调大更连贯，也更费 token。"), (0, react.createElement)("div", { className: "dshtavern-agent-quick" }, (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "一键预设："), Object.entries(CONTEXT_PRESETS).map(([id, preset]) => (0, react.createElement)("button", {
				key: id,
				type: "button",
				className: "dshtavern-button dshtavern-agent-quick-button",
				"data-active": activePreset === id ? "true" : "false",
				disabled,
				title: `${preset.stageWindow} 行 / 扫描 ${preset.loreScanLines} 行 / 世界书 ${preset.loreMaxEntries} 条 ${preset.loreMaxChars} 字`,
				onClick: () => update({
					stageWindow: preset.stageWindow,
					loreScanLines: preset.loreScanLines,
					loreMaxEntries: preset.loreMaxEntries,
					loreMaxChars: preset.loreMaxChars,
					playerInputMax: preset.playerInputMax
				})
			}, preset.label)), activePreset === void 0 ? (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "（自定义）") : null), num("stageWindow", "角色可见舞台行数", "每个角色能看到最近多少条旁白与台词。"), num("loreScanLines", "世界书扫描行数", "关键词匹配回溯多少条舞台记录。"), num("loreMaxEntries", "世界书最多条数", "单次请求最多注入多少条命中条目。"), num("loreMaxChars", "世界书最多字数", "单次请求注入条目内容的总字数上限。"), num("playerInputMax", "玩家输入上限", "超过这个长度的玩家输入会被截断。"), (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "舞台字数上限"), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "可选。行数很大时用它兜住总字数，超出时从最旧的记录开始丢弃；留空只按行数裁剪。")), (0, react.createElement)("span", { className: "dshtavern-agent-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-agent-input",
				type: "number",
				min: AGENT_LIMITS.stageMaxChars.min,
				max: AGENT_LIMITS.stageMaxChars.max,
				step: AGENT_LIMITS.stageMaxChars.step,
				placeholder: "不限",
				value: config.stageMaxChars === void 0 ? "" : String(config.stageMaxChars),
				disabled,
				onChange: (event) => {
					const raw = event.target.value.trim();
					if (raw.length === 0) {
						update({ stageMaxChars: void 0 });
						return;
					}
					const parsed = Number(raw);
					if (!Number.isFinite(parsed)) return;
					const { min, max } = AGENT_LIMITS.stageMaxChars;
					update({ stageMaxChars: Math.min(max, Math.max(min, Math.round(parsed))) });
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, AGENT_LIMITS.stageMaxChars.unit)))));
			const modelsPane = (0, react.createElement)(SubTabPane, null, (0, react.createElement)("div", { className: "dshtavern-agent-group" }, (0, react.createElement)("div", { className: "dshtavern-agent-group-note" }, "留空表示跟随会话当前模型。导演与角色可用不同模型：导演负责判断，角色负责文风。"), (0, react.createElement)(ModelPicker, {
				label: "导演模型",
				hint: "导演每次都要输出 JSON 并选择说话人。",
				choice: config.directorModel,
				catalog,
				disabled,
				onChange: (choice) => update(choice === void 0 ? { directorModel: void 0 } : { directorModel: choice })
			}), (0, react.createElement)(ModelPicker, {
				label: "角色模型",
				hint: "每个开口的角色各发起一次独立调用。",
				choice: config.characterModel,
				catalog,
				disabled,
				onChange: (choice) => update(choice === void 0 ? { characterModel: void 0 } : { characterModel: choice })
			})));
			const replyPane = (0, react.createElement)(SubTabPane, null, (0, react.createElement)(ReplyBudgetGroup, {
				config,
				characters,
				disabled,
				onChange: (patch) => update(patch)
			}));
			const pane = activeTab === "beat" ? beatPane : activeTab === "context" ? contextPane : activeTab === "models" ? modelsPane : replyPane;
			return (0, react.createElement)("section", { className: "dshtavern-agent" }, (0, react.createElement)("div", { className: "dshtavern-agent-toolbar" }, (0, react.createElement)("span", {
				className: "dshtavern-pill",
				"data-tone": saving ? "busy" : dirty ? void 0 : "ok"
			}, saving ? "保存中…" : dirty ? "有未保存的修改" : differsFromDefault ? "已保存（自定义）" : "已保存（默认）"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled,
				onClick: () => {
					load();
				}
			}, "重新读取"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled,
				onClick: () => {
					persist(config, true);
				}
			}, "恢复默认"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: disabled || !dirty,
				onClick: () => {
					persist(config);
				}
			}, "保存")), error === null ? null : (0, react.createElement)("div", { className: CLASS.bannerError }, error), notice === null ? null : (0, react.createElement)("div", { className: CLASS.bannerNotice }, notice), (0, react.createElement)(SubTabs, {
				ariaLabel: "Agent 编排页面",
				active: activeTab,
				tabs: AGENT_TABS.map((tab) => ({
					id: tab.id,
					label: tab.label,
					hint: tab.hint,
					changed: agentTabChanged(config, saved, tab.fields)
				})),
				onSelect: (id) => setActiveTab(id)
			}), pane);
		}
		/**
		* Reply-length controls: one shared budget plus per-role and per-character
		* overrides.
		*
		* The budget is expressed in characters because that is what an author counts;
		* the host converts it to the provider's token cap.
		*/
		function ReplyBudgetGroup(props) {
			const { config, disabled } = props;
			const shared = config.maxReplyChars;
			const bounds = AGENT_LIMITS.maxReplyChars;
			const overrides = config.characterMaxReplyChars ?? {};
			const overriddenCount = Object.keys(overrides).length;
			const clearAll = () => {
				props.onChange({
					maxReplyChars: void 0,
					directorMaxReplyChars: void 0,
					characterMaxReplyChars: void 0
				});
			};
			const setOverride = (id, value) => {
				const next = { ...overrides };
				if (value === void 0) delete next[id];
				else next[id] = value;
				props.onChange({ characterMaxReplyChars: Object.keys(next).length === 0 ? void 0 : next });
			};
			return (0, react.createElement)("div", { className: "dshtavern-agent-group" }, (0, react.createElement)("div", { className: "dshtavern-agent-group-note" }, `留空表示不限制，由模型自身决定。字数按约 ${TOKENS_PER_CHAR} token/字换算成模型的输出上限。`), (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "统一回复长度"), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "所有调用的默认上限；下面的逐角色设置会覆盖它。")), (0, react.createElement)("span", { className: "dshtavern-agent-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-agent-input",
				type: "number",
				min: bounds.min,
				max: bounds.max,
				step: bounds.step,
				placeholder: "不限",
				value: shared === void 0 ? "" : String(shared),
				disabled,
				onChange: (event) => {
					const raw = event.target.value.trim();
					if (raw.length === 0) {
						props.onChange({ maxReplyChars: void 0 });
						return;
					}
					const parsed = Number(raw);
					if (!Number.isFinite(parsed)) return;
					props.onChange({ maxReplyChars: Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))) });
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, bounds.unit))), (0, react.createElement)("div", { className: "dshtavern-agent-quick" }, (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "一键设置："), QUICK_SIZES.map((size) => (0, react.createElement)("button", {
				key: size,
				type: "button",
				className: "dshtavern-button dshtavern-agent-quick-button",
				"data-active": shared === size ? "true" : "false",
				disabled,
				onClick: () => props.onChange({ maxReplyChars: size })
			}, `${size} 字`)), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-agent-quick-button",
				"data-active": shared === void 0 ? "true" : "false",
				disabled,
				onClick: () => {
					clearAll();
				}
			}, "不限")), (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "导演回复长度"), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "覆盖统一值。导演只输出 JSON 指令，通常可以更短。")), (0, react.createElement)("span", { className: "dshtavern-agent-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-agent-input",
				type: "number",
				min: bounds.min,
				max: bounds.max,
				step: bounds.step,
				placeholder: shared === void 0 ? "不限" : `同统一 ${shared}`,
				value: config.directorMaxReplyChars === void 0 ? "" : String(config.directorMaxReplyChars),
				disabled,
				onChange: (event) => {
					const raw = event.target.value.trim();
					if (raw.length === 0) {
						props.onChange({ directorMaxReplyChars: void 0 });
						return;
					}
					const parsed = Number(raw);
					if (!Number.isFinite(parsed)) return;
					props.onChange({ directorMaxReplyChars: Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))) });
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, bounds.unit))), (0, react.createElement)("div", { className: "dshtavern-agent-subhead" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "逐角色回复长度"), overriddenCount === 0 ? (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, "全部沿用统一值") : (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, `${overriddenCount} 个角色单独设置`)), props.characters.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-agent-hint" }, "这个工作区还没有角色卡。") : (0, react.createElement)("div", { className: "dshtavern-agent-chars" }, props.characters.map((character) => (0, react.createElement)("label", {
				key: character.id,
				className: "dshtavern-agent-char-row"
			}, (0, react.createElement)("span", {
				className: "dshtavern-agent-char-name",
				title: character.id
			}, character.name), (0, react.createElement)("input", {
				className: "dshtavern-agent-input dshtavern-agent-char-input",
				type: "number",
				min: bounds.min,
				max: bounds.max,
				step: bounds.step,
				placeholder: shared === void 0 ? "不限" : String(shared),
				value: overrides[character.id] === void 0 ? "" : String(overrides[character.id]),
				disabled,
				onChange: (event) => {
					const raw = event.target.value.trim();
					if (raw.length === 0) {
						setOverride(character.id, void 0);
						return;
					}
					const parsed = Number(raw);
					if (!Number.isFinite(parsed)) return;
					setOverride(character.id, Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))));
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, bounds.unit)))), (0, react.createElement)("label", { className: "dshtavern-agent-row" }, (0, react.createElement)("span", { className: "dshtavern-agent-row-text" }, (0, react.createElement)("span", { className: "dshtavern-agent-label" }, "推理预留"), (0, react.createElement)("span", { className: "dshtavern-agent-hint" }, `模型把思考与正文算在同一个输出上限里。留出这段 token，字数预算才真正用在正文上；默认 ${DEFAULT_RESERVE}。`)), (0, react.createElement)("span", { className: "dshtavern-agent-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-agent-input",
				type: "number",
				min: AGENT_LIMITS.reasoningReserveTokens.min,
				max: AGENT_LIMITS.reasoningReserveTokens.max,
				step: AGENT_LIMITS.reasoningReserveTokens.step,
				placeholder: String(DEFAULT_RESERVE),
				value: config.reasoningReserveTokens === void 0 ? "" : String(config.reasoningReserveTokens),
				disabled,
				onChange: (event) => {
					const raw = event.target.value.trim();
					if (raw.length === 0) {
						props.onChange({ reasoningReserveTokens: void 0 });
						return;
					}
					const parsed = Number(raw);
					if (!Number.isFinite(parsed)) return;
					const { min, max } = AGENT_LIMITS.reasoningReserveTokens;
					props.onChange({ reasoningReserveTokens: Math.min(max, Math.max(min, Math.round(parsed))) });
				}
			}), (0, react.createElement)("span", { className: "dshtavern-agent-unit" }, AGENT_LIMITS.reasoningReserveTokens.unit))));
		}
		/** One-click budgets offered above the shared reply-length field. */
		const QUICK_SIZES = [
			120,
			240,
			400,
			800
		];
		/** Tokens per Chinese character, mirrored from the host for the panel's hint. */
		const TOKENS_PER_CHAR = .6;
		/** Reasoning headroom default, mirrored from the host so the placeholder matches. */
		const DEFAULT_RESERVE = 512;
		/**
		* Select the entries one reader should receive.
		*
		* Constant entries bypass matching. Keyed entries scan the last `depth` lines
		* (their own depth, else the whole provided window) plus `scanText`. Secondary
		* keys then narrow the hit through the entry's logic. The result is ordered by
		* `order` and cut to the budget, so a long worldbook degrades predictably
		* instead of silently consuming the request.
		* @param options - entries, scan inputs, reader, and budget.
		* @returns activated entries in injection order.
		*/
		function activateEntries(options) {
			const maxEntries = options.maxEntries ?? 8;
			const maxChars = options.maxChars ?? 6e3;
			const eligible = options.entries.filter((entry) => entry.enabled && entry.content.trim().length > 0).filter((entry) => readableBy(entry, options.reader)).filter((entry) => entry.constant || matches(entry, options)).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
			const selected = [];
			let usedChars = 0;
			for (const entry of eligible) {
				if (selected.length >= maxEntries) break;
				const cost = entry.content.length;
				if (usedChars + cost > maxChars) continue;
				usedChars += cost;
				selected.push(entry);
			}
			return selected;
		}
		/**
		* Whether one entry may be read by one prompt.
		*
		* The director reads everything: entries scoped to a single character are facts
		* the game master still knows. A character reads only entries marked for
		* everyone or for that exact character.
		* @param entry - candidate entry.
		* @param reader - the prompt being assembled.
		* @returns whether the reader may receive this entry.
		*/
		function readableBy(entry, reader) {
			if (reader.kind === "director") return true;
			if (entry.visibility === "all") return true;
			if (entry.visibility === "characters") return entry.characterIds.includes(reader.characterId);
			return false;
		}
		/** Whether one entry's triggers hit the scanned text. */
		function matches(entry, options) {
			if (entry.keys.length === 0) return false;
			const haystack = [(entry.depth > 0 ? options.recentLines.slice(-entry.depth) : options.recentLines).join("\n"), options.scanText].join("\n");
			if (!hitsAny(entry.keys, haystack, entry)) return false;
			if (entry.secondaryKeys.length === 0) return true;
			return applyLogic(entry, haystack);
		}
		/** Apply the secondary-key logic to a primary hit. */
		function applyLogic(entry, haystack) {
			const results = entry.secondaryKeys.map((key) => keyHits(key, haystack, entry));
			switch (entry.logic) {
				case "and_all": return results.every(Boolean);
				case "not_any": return !results.some(Boolean);
				case "not_all": return !results.every(Boolean);
				default: return results.some(Boolean);
			}
		}
		function hitsAny(keys, haystack, entry) {
			return keys.some((key) => keyHits(key, haystack, entry));
		}
		/** Whether one key occurs in the haystack under the entry's matching rules. */
		function keyHits(key, haystack, entry) {
			if (!entry.wholeWords) {
				const needle = entry.caseSensitive ? key : key.toLowerCase();
				return (entry.caseSensitive ? haystack : haystack.toLowerCase()).includes(needle);
			}
			return wholeWordIndex(haystack, key, {
				caseSensitive: entry.caseSensitive,
				cjkWords: true
			}) !== -1;
		}
		/**
		* Find a key that sits on word boundaries.
		* @param subject - text to search.
		* @param needle - key to find.
		* @param options - case folding and whether CJK binds.
		* @returns the match index, or `-1` when no bounded occurrence exists.
		*/
		function wholeWordIndex(subject, needle, options) {
			if (needle.length === 0) return -1;
			const wanted = options.caseSensitive ? needle : needle.toLowerCase();
			const haystack = options.caseSensitive ? subject : subject.toLowerCase();
			let from = 0;
			while (from <= haystack.length) {
				const index = haystack.indexOf(wanted, from);
				if (index === -1) return -1;
				const before = haystack[index - 1];
				const after = haystack[index + wanted.length];
				if (!isWordChar(before, options.cjkWords) && !isWordChar(after, options.cjkWords)) return index;
				from = index + 1;
			}
			return -1;
		}
		/**
		* Word characters are ASCII letters and digits, plus CJK ideographs, kana, and
		* hangul when {@link WholeWordOptions.cjkWords} is set.
		*/
		function isWordChar(char, cjkWords) {
			if (char === void 0) return false;
			if (/[A-Za-z0-9]/.test(char)) return true;
			return cjkWords && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(char);
		}
		//#endregion
		//#region src/client/worldbook.ts
		const INITIAL$1 = {
			loading: true,
			saving: false,
			error: null,
			notice: null,
			entries: [],
			preview: ""
		};
		const LOGIC_LABELS = {
			and_any: "次要词命中任意一个",
			and_all: "次要词全部命中",
			not_any: "次要词一个都不出现",
			not_all: "次要词不全部出现"
		};
		/** Human-facing label for one visibility. */
		const VISIBILITY_LABELS = {
			all: "所有角色可见",
			director: "仅导演可见",
			characters: "指定角色可见"
		};
		/** A blank entry for the "new" action. */
		function blankEntry() {
			return {
				id: "",
				name: "",
				content: "",
				keys: [],
				secondaryKeys: [],
				logic: "and_any",
				constant: false,
				visibility: "all",
				characterIds: [],
				order: 100,
				depth: 6,
				enabled: true,
				caseSensitive: false,
				wholeWords: false
			};
		}
		function errorText$3(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		async function readJson$2(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`酒馆接口不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("酒馆接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `请求失败（HTTP ${response.status}）`);
			return record;
		}
		/**
		* Load the character cards a visibility picker can offer.
		* @param workspaceId - tavern workspace id.
		* @returns card ids and names; empty when the workspace has none.
		*/
		async function loadCharacters(workspaceId) {
			const body = await readJson$2(await fetch(`/tavern/characters?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			if (!Array.isArray(body.cards)) return [];
			return body.cards.filter((card) => typeof card.id === "string" && typeof card.name === "string").map((card) => ({
				id: card.id,
				name: card.name
			}));
		}
		async function loadWorldbook(workspaceId) {
			const body = await readJson$2(await fetch(`/tavern/worldbook?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			return Array.isArray(body.entries) ? body.entries : [];
		}
		async function saveWorldbook(workspaceId, entries) {
			const body = await readJson$2(await fetch("/tavern/worldbook", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					entries
				})
			}));
			return Array.isArray(body.entries) ? body.entries : [];
		}
		/**
		* Ask the host for the workspace worldbook as a `.world` document.
		* @param workspaceId - tavern workspace id.
		* @returns the suggested file name and document text.
		*/
		async function exportWorldbook(workspaceId) {
			const body = await readJson$2(await fetch(`/tavern/worldbook/transfer?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			return {
				file: String(body.file),
				text: String(body.text)
			};
		}
		/**
		* Replace the workspace worldbook from a `.world` document.
		* @param workspaceId - tavern workspace id.
		* @param text - document text.
		* @returns the stored entries.
		*/
		async function importWorldbook(workspaceId, text) {
			const body = await readJson$2(await fetch("/tavern/worldbook/transfer", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					text
				})
			}));
			return Array.isArray(body.entries) ? body.entries : [];
		}
		/**
		* Decide which entries a sample line would activate.
		*
		* Runs the shared matching engine with an empty stage, so the panel reports
		* exactly the activation the host would compute for that line.
		* @param entries - stored entries.
		* @param sample - text to scan.
		* @returns activated entries in injection order.
		*/
		function previewActivation(entries, sample) {
			const lore = activateEntries({
				entries,
				scanText: sample,
				recentLines: [],
				reader: { kind: "director" }
			});
			const ids = new Set(lore.map((entry) => entry.id));
			return entries.filter((entry) => ids.has(entry.id));
		}
		/** One labelled field row. */
		function Field$1(props) {
			return (0, react.createElement)("label", { className: "dshtavern-wb-field" }, (0, react.createElement)("span", { className: "dshtavern-wb-label" }, props.label), props.children, props.hint === void 0 ? null : (0, react.createElement)("span", { className: "dshtavern-wb-hint" }, props.hint));
		}
		/** One labelled checkbox. */
		function Toggle(props) {
			return (0, react.createElement)("label", { className: "dshtavern-wb-toggle" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: props.checked,
				onChange: (event) => props.onChange(event.target.checked)
			}), props.label);
		}
		/** Split a comma-separated keyword field. */
		function splitKeys(value) {
			return value.split(/[,，]/).map((part) => part.trim()).filter((part) => part.length > 0);
		}
		/**
		* Two-pane worldbook editor: the entry list on the left, the selected entry on
		* the right, with an activation preview under the form.
		* @param props - the workspace this workbench edits.
		* @returns the workbench section.
		*/
		function WorldbookWorkbench(props) {
			const [state, setState] = (0, react.useState)(INITIAL$1);
			const [characters, setCharacters] = (0, react.useState)([]);
			const [draft, setDraft] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(async (notice = null) => {
				try {
					const entries = await loadWorldbook(props.workspaceId);
					setState((prev) => ({
						...prev,
						loading: false,
						saving: false,
						error: null,
						notice,
						entries
					}));
				} catch (cause) {
					setState((prev) => ({
						...prev,
						loading: false,
						saving: false,
						error: errorText$3(cause)
					}));
				}
			}, [props.workspaceId]);
			(0, react.useEffect)(() => {
				setState(INITIAL$1);
				setDraft(null);
				loadCharacters(props.workspaceId).then(setCharacters).catch(() => setCharacters([]));
				reload(null);
			}, [reload, props.workspaceId]);
			const commit = (0, react.useCallback)(async (entries, notice, keep) => {
				setState((prev) => ({
					...prev,
					saving: true,
					error: null,
					notice: null
				}));
				try {
					const stored = await saveWorldbook(props.workspaceId, entries);
					const next = keep === null ? null : stored.find((entry) => entry.name === keep.name && entry.content === keep.content) ?? stored[stored.length - 1] ?? null;
					setState((prev) => ({
						...prev,
						saving: false,
						entries: stored,
						notice
					}));
					setDraft(next === null ? null : { ...next });
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$3(cause)
					}));
				}
			}, [props.workspaceId]);
			const onSaveDraft = () => {
				if (draft === null) return;
				if (draft.name.trim().length === 0) {
					setState((prev) => ({
						...prev,
						error: "世界书条目需要名称"
					}));
					return;
				}
				const creating = draft.id === "";
				const next = creating ? [...state.entries, draft] : state.entries.map((entry) => entry.id === draft.id ? draft : entry);
				commit(next, creating ? "已新增条目" : "已保存条目", draft);
			};
			const onDelete = (id) => {
				commit(state.entries.filter((entry) => entry.id !== id), "已删除条目", null);
			};
			const onImport = (0, react.useCallback)(async () => {
				setState((prev) => ({
					...prev,
					error: null,
					notice: null
				}));
				let picked;
				try {
					picked = await pickTextFile(".world,application/json");
				} catch (cause) {
					setState((prev) => ({
						...prev,
						error: errorText$3(cause)
					}));
					return;
				}
				if (picked === void 0) return;
				setState((prev) => ({
					...prev,
					saving: true
				}));
				try {
					const entries = await importWorldbook(props.workspaceId, picked.text);
					setState((prev) => ({
						...prev,
						saving: false,
						entries,
						notice: `已导入 ${entries.length} 条世界书条目`,
						error: null
					}));
					setDraft(null);
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$3(cause)
					}));
				}
			}, [props.workspaceId]);
			const onExport = (0, react.useCallback)(async () => {
				setState((prev) => ({
					...prev,
					error: null,
					notice: null
				}));
				try {
					downloadDocument(await exportWorldbook(props.workspaceId));
					setState((prev) => ({
						...prev,
						notice: "已导出世界书"
					}));
				} catch (cause) {
					setState((prev) => ({
						...prev,
						error: errorText$3(cause)
					}));
				}
			}, [props.workspaceId]);
			const previewHits = (0, react.useMemo)(() => state.preview.trim().length === 0 ? [] : previewActivation(state.entries, state.preview), [state.entries, state.preview]);
			const selected = draft;
			const listPane = (0, react.createElement)("aside", { className: "dshtavern-wb-sidebar" }, (0, react.createElement)("div", { className: "dshtavern-wb-side-head" }, (0, react.createElement)("div", { className: "dshtavern-wb-side-title" }, (0, react.createElement)("span", { className: "dshtavern-wb-heading" }, "世界书"), (0, react.createElement)("span", { className: "dshtavern-wb-count" }, String(state.entries.length))), (0, react.createElement)("div", { className: "dshtavern-wb-side-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-wb-new",
				disabled: state.saving,
				title: "从 .world 文件导入（替换当前世界书）",
				onClick: () => {
					onImport();
				}
			}, "导入"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-wb-new",
				disabled: state.saving || state.entries.length === 0,
				title: "导出为 .world 文件",
				onClick: () => {
					onExport();
				}
			}, "导出"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary dshtavern-wb-new",
				disabled: state.saving,
				onClick: () => setDraft(blankEntry())
			}, "新建"))), (0, react.createElement)("div", { className: "dshtavern-wb-list" }, state.loading ? (0, react.createElement)("div", { className: "dshtavern-wb-empty" }, "加载中…") : state.entries.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-wb-empty" }, "还没有条目。世界书条目按关键词触发，工作区内所有角色共享。") : [
				"all",
				"characters",
				"director"
			].map((visibility) => {
				const group = state.entries.filter((entry) => entry.visibility === visibility);
				if (group.length === 0) return null;
				return (0, react.createElement)("div", {
					key: visibility,
					className: "dshtavern-wb-group"
				}, (0, react.createElement)("div", { className: "dshtavern-wb-group-head" }, (0, react.createElement)("span", { className: "dshtavern-wb-group-title" }, VISIBILITY_LABELS[visibility]), (0, react.createElement)("span", { className: "dshtavern-wb-group-count" }, String(group.length))), group.map((entry) => (0, react.createElement)("button", {
					key: entry.id,
					type: "button",
					className: "dshtavern-wb-row",
					"data-selected": selected?.id === entry.id,
					"data-disabled": entry.enabled ? void 0 : "true",
					onClick: () => setDraft({ ...entry })
				}, (0, react.createElement)("span", { className: "dshtavern-wb-row-name" }, entry.name), (0, react.createElement)("span", { className: "dshtavern-wb-row-meta" }, entry.constant ? "常驻" : entry.keys.slice(0, 3).join(" / ") || "无关键词"), entry.enabled ? null : (0, react.createElement)("span", { className: "dshtavern-wb-flag" }, "已停用"))));
			})));
			const previewPane = (0, react.createElement)("div", { className: "dshtavern-wb-preview" }, (0, react.createElement)("div", { className: "dshtavern-wb-label" }, "触发预览"), (0, react.createElement)("input", {
				className: "dshtavern-wb-input",
				value: state.preview,
				placeholder: "输入一句台词，看看哪些条目会被激活",
				onChange: (event) => setState((prev) => ({
					...prev,
					preview: event.target.value
				}))
			}), state.preview.trim().length === 0 ? (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, "输入后这里列出会进入提示词的条目。") : previewHits.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, "没有条目会被激活。") : (0, react.createElement)("div", { className: "dshtavern-wb-hits" }, previewHits.map((entry) => (0, react.createElement)("div", {
				key: entry.id,
				className: "dshtavern-wb-hit"
			}, (0, react.createElement)("span", null, entry.name), (0, react.createElement)("span", { className: "dshtavern-wb-hit-meta" }, VISIBILITY_LABELS[entry.visibility])))));
			const editor = selected === null ? (0, react.createElement)("div", { className: "dshtavern-wb-placeholder" }, (0, react.createElement)("div", { className: "dshtavern-wb-placeholder-title" }, "世界书"), (0, react.createElement)("div", null, "选中一条条目开始编辑，或点「新建」创建。"), (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, "条目只在关键词出现时才进入提示词，所以同一段设定不必在每张角色卡里重复。")) : (0, react.createElement)("div", { className: "dshtavern-wb-editor" }, (0, react.createElement)("div", { className: "dshtavern-wb-editor-head" }, (0, react.createElement)("div", { className: "dshtavern-wb-editor-title" }, (0, react.createElement)("div", { className: "dshtavern-wb-heading" }, selected.id === "" ? "新建条目" : selected.name || "未命名"), (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, selected.id === "" ? "保存后写入 .dshtavern/worldbook.json" : `id ${selected.id.slice(0, 8)}`)), (0, react.createElement)("div", { className: "dshtavern-wb-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: state.saving,
				onClick: onSaveDraft
			}, state.saving ? "保存中…" : "保存"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				onClick: () => setDraft(null)
			}, "关闭"), selected.id === "" ? null : (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-danger",
				disabled: state.saving,
				onClick: () => onDelete(selected.id)
			}, "删除"))), (0, react.createElement)("div", { className: "dshtavern-wb-grid" }, Field$1({
				label: "名称",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					value: selected.name,
					placeholder: "例如：星屑回廊",
					onChange: (event) => update$1(draft, setDraft, { name: event.target.value })
				})
			}), Field$1({
				label: "可见性",
				hint: "谁能在提示词里读到这条设定。导演始终能读到全部。",
				children: (0, react.createElement)("select", {
					className: "dshtavern-wb-input",
					value: selected.visibility,
					onChange: (event) => update$1(draft, setDraft, { visibility: event.target.value })
				}, Object.keys(VISIBILITY_LABELS).map((key) => (0, react.createElement)("option", {
					key,
					value: key
				}, VISIBILITY_LABELS[key])))
			})), selected.visibility === "characters" ? Field$1({
				label: "可见的角色",
				hint: characters.length === 0 ? "这个酒馆还没有角色卡。" : "只有选中的角色会在自己的提示词里读到这条。",
				children: (0, react.createElement)("div", { className: "dshtavern-wb-chars" }, characters.length === 0 ? (0, react.createElement)("span", { className: "dshtavern-wb-hint" }, "（暂无角色卡）") : characters.map((character) => (0, react.createElement)("label", {
					key: character.id,
					className: "dshtavern-wb-toggle"
				}, (0, react.createElement)("input", {
					type: "checkbox",
					checked: selected.characterIds.includes(character.id),
					onChange: (event) => update$1(draft, setDraft, { characterIds: event.target.checked ? [...selected.characterIds, character.id] : selected.characterIds.filter((id) => id !== character.id) })
				}), character.name)))
			}) : null, Field$1({
				label: "关键词（任意一个出现即触发）",
				hint: "逗号分隔。留空且未开常驻时，这条永远不会触发。",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					value: selected.keys.join(", "),
					placeholder: "星屑回廊, 回廊, 法阵",
					onChange: (event) => update$1(draft, setDraft, { keys: splitKeys(event.target.value) })
				})
			}), (0, react.createElement)("div", { className: "dshtavern-wb-grid" }, Field$1({
				label: "次要关键词",
				hint: "用来收窄主要关键词的命中范围。",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					value: selected.secondaryKeys.join(", "),
					onChange: (event) => update$1(draft, setDraft, { secondaryKeys: splitKeys(event.target.value) })
				})
			}), Field$1({
				label: "次要词逻辑",
				children: (0, react.createElement)("select", {
					className: "dshtavern-wb-input",
					value: selected.logic,
					disabled: selected.secondaryKeys.length === 0,
					onChange: (event) => update$1(draft, setDraft, { logic: event.target.value })
				}, Object.keys(LOGIC_LABELS).map((key) => (0, react.createElement)("option", {
					key,
					value: key
				}, LOGIC_LABELS[key])))
			})), Field$1({
				label: "内容",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.content,
					rows: 6,
					placeholder: "触发时注入提示词的世界设定文本。",
					onChange: (event) => update$1(draft, setDraft, { content: event.target.value })
				})
			}), (0, react.createElement)("div", { className: "dshtavern-wb-grid" }, Field$1({
				label: "顺序",
				hint: "数字小的先注入，也先占用预算。",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					type: "number",
					value: String(selected.order),
					onChange: (event) => update$1(draft, setDraft, { order: Number(event.target.value) || 0 })
				})
			}), Field$1({
				label: "扫描深度",
				hint: "回溯最近几行舞台；0 表示整个窗口。",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					type: "number",
					value: String(selected.depth),
					onChange: (event) => update$1(draft, setDraft, { depth: Number(event.target.value) || 0 })
				})
			})), (0, react.createElement)("div", { className: "dshtavern-wb-toggles" }, Toggle({
				label: "启用",
				checked: selected.enabled,
				onChange: (value) => update$1(draft, setDraft, { enabled: value })
			}), Toggle({
				label: "常驻（忽略关键词）",
				checked: selected.constant,
				onChange: (value) => update$1(draft, setDraft, { constant: value })
			}), Toggle({
				label: "区分大小写",
				checked: selected.caseSensitive,
				onChange: (value) => update$1(draft, setDraft, { caseSensitive: value })
			}), Toggle({
				label: "整词匹配",
				checked: selected.wholeWords,
				onChange: (value) => update$1(draft, setDraft, { wholeWords: value })
			})), previewPane);
			return (0, react.createElement)("section", { className: "dshtavern-wb-panel" }, listPane, (0, react.createElement)("div", { className: "dshtavern-wb-main" }, state.error === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-error" }, state.error), state.notice === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-notice" }, state.notice), editor));
		}
		/** Apply one field patch to the draft. */
		function update$1(draft, setDraft, patch) {
			if (draft === null) return;
			setDraft({
				...draft,
				...patch
			});
		}
		//#endregion
		//#region src/client/persona.ts
		/**
		* Player persona workbench.
		*
		* A persona is the player's own identity in a tavern: name, appearance,
		* temperament, background, and how they speak. It is scoped to the workspace, so
		* every chat in one tavern shares it, and exactly one persona is active at a
		* time — the active one fills the `user-persona` prompt block.
		*/
		const INITIAL = {
			loading: true,
			saving: false,
			error: null,
			notice: null,
			personas: [],
			activeId: null
		};
		/** A blank persona for the "new" action. */
		function blankPersona() {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			return {
				id: "",
				name: "",
				description: "",
				personality: "",
				background: "",
				speakingStyle: "",
				characterSheet: "",
				tags: [],
				createdAt: now,
				updatedAt: now
			};
		}
		function errorText$2(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		async function readJson$1(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`酒馆接口不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("酒馆接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `请求失败（HTTP ${response.status}）`);
			return record;
		}
		async function loadPersonas(workspaceId) {
			const body = await readJson$1(await fetch(`/tavern/personas?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
			return {
				personas: Array.isArray(body.personas) ? body.personas : [],
				activeId: typeof body.activeId === "string" ? body.activeId : null
			};
		}
		async function savePersonas(workspaceId, personas, activeId) {
			const body = await readJson$1(await fetch("/tavern/personas", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					personas: personas.map((persona) => ({
						id: persona.id === "" ? void 0 : persona.id,
						name: persona.name,
						description: persona.description,
						personality: persona.personality,
						background: persona.background,
						speakingStyle: persona.speakingStyle,
						characterSheet: persona.characterSheet,
						tags: persona.tags
					})),
					activeId: activeId ?? void 0
				})
			}));
			return {
				personas: Array.isArray(body.personas) ? body.personas : [],
				activeId: typeof body.activeId === "string" ? body.activeId : null
			};
		}
		/**
		* Render the prompt text one persona contributes.
		*
		* Mirrors the host renderer so the preview matches the request. Empty fields are
		* dropped rather than emitted as labelled blanks.
		* @param persona - persona to render.
		* @returns the block text.
		*/
		function renderPersonaPreview(persona) {
			const lines = [`玩家扮演「${persona.name || "未命名"}」。`];
			const parts = [
				["外观", persona.description],
				["性格", persona.personality],
				["背景", persona.background],
				["说话方式", persona.speakingStyle],
				["角色设定", persona.characterSheet]
			];
			for (const [label, value] of parts) {
				const trimmed = value.trim();
				if (trimmed.length > 0) lines.push(`${label}：${trimmed}`);
			}
			return lines.join("\n");
		}
		/** One labelled text field. */
		function Field(props) {
			return (0, react.createElement)("label", { className: "dshtavern-wb-field" }, (0, react.createElement)("span", { className: "dshtavern-wb-label" }, props.label), props.children, props.hint === void 0 ? null : (0, react.createElement)("span", { className: "dshtavern-wb-hint" }, props.hint));
		}
		/**
		* Two-pane persona editor: the library on the left, the selected persona on the
		* right, with the active persona marked so the list answers "who am I now".
		* @param props - the workspace this workbench edits.
		* @returns the workbench section.
		*/
		function PersonaWorkbench(props) {
			const [state, setState] = (0, react.useState)(INITIAL);
			const [draft, setDraft] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(async (notice = null) => {
				try {
					const { personas, activeId } = await loadPersonas(props.workspaceId);
					setState({
						loading: false,
						saving: false,
						error: null,
						notice,
						personas,
						activeId
					});
				} catch (cause) {
					setState((prev) => ({
						...prev,
						loading: false,
						saving: false,
						error: errorText$2(cause)
					}));
				}
			}, [props.workspaceId]);
			(0, react.useEffect)(() => {
				setState(INITIAL);
				setDraft(null);
				reload(null);
			}, [reload]);
			const commit = (0, react.useCallback)(async (personas, activeId, notice, keep) => {
				setState((prev) => ({
					...prev,
					saving: true,
					error: null,
					notice: null
				}));
				try {
					const stored = await savePersonas(props.workspaceId, personas, activeId);
					setState((prev) => ({
						...prev,
						saving: false,
						personas: stored.personas,
						activeId: stored.activeId,
						notice
					}));
					const next = keep === null ? null : stored.personas.find((persona) => persona.name === keep.name && persona.background === keep.background) ?? stored.personas[stored.personas.length - 1] ?? null;
					setDraft(next === null ? null : { ...next });
				} catch (cause) {
					setState((prev) => ({
						...prev,
						saving: false,
						error: errorText$2(cause)
					}));
				}
			}, [props.workspaceId]);
			const onSaveDraft = () => {
				if (draft === null) return;
				if (draft.name.trim().length === 0) {
					setState((prev) => ({
						...prev,
						error: "玩家人设需要名称"
					}));
					return;
				}
				const creating = draft.id === "";
				const next = creating ? [...state.personas, draft] : state.personas.map((persona) => persona.id === draft.id ? draft : persona);
				commit(next, state.activeId, creating ? "已新增人设" : "已保存人设", draft);
			};
			const onActivate = (id) => {
				if (state.activeId === id) return;
				commit(state.personas, id, "已切换当前人设", state.personas.find((p) => p.id === id) ?? null);
			};
			const onDelete = (id) => {
				const remaining = state.personas.filter((persona) => persona.id !== id);
				commit(remaining, state.activeId === id ? null : state.activeId, "已删除人设", null);
			};
			const selected = draft;
			const preview = (0, react.useMemo)(() => selected === null ? "" : renderPersonaPreview(selected), [selected]);
			const active = state.personas.find((persona) => persona.id === state.activeId);
			const listPane = (0, react.createElement)("aside", { className: "dshtavern-wb-sidebar" }, (0, react.createElement)("div", { className: "dshtavern-wb-side-head" }, (0, react.createElement)("span", { className: "dshtavern-wb-heading" }, "玩家人设"), (0, react.createElement)("span", { className: "dshtavern-wb-count" }, String(state.personas.length)), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary dshtavern-wb-new",
				disabled: state.saving,
				onClick: () => setDraft(blankPersona())
			}, "新建")), (0, react.createElement)("div", { className: "dshtavern-wb-list" }, state.loading ? (0, react.createElement)("div", { className: "dshtavern-wb-empty" }, "加载中…") : state.personas.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-wb-empty" }, "还没有人设。人设描述你在这个酒馆里是谁，工作区内所有会话共用。") : state.personas.map((persona) => (0, react.createElement)("button", {
				key: persona.id,
				type: "button",
				className: "dshtavern-wb-row",
				"data-selected": selected?.id === persona.id,
				onClick: () => setDraft({ ...persona })
			}, (0, react.createElement)("span", { className: "dshtavern-wb-row-name" }, persona.name), (0, react.createElement)("span", { className: "dshtavern-wb-row-meta" }, persona.tags.length > 0 ? persona.tags.slice(0, 3).join(" · ") : "无标签"), persona.id === state.activeId ? (0, react.createElement)("span", { className: "dshtavern-wb-flag dshtavern-wb-flag-active" }, "当前") : null))));
			const editor = selected === null ? (0, react.createElement)("div", { className: "dshtavern-wb-placeholder" }, (0, react.createElement)("div", { className: "dshtavern-wb-placeholder-title" }, "玩家人设"), (0, react.createElement)("div", null, "选中一个人设开始编辑，或点「新建」创建。"), (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, active === void 0 ? "还没有生效的人设，角色会把你当作默认的「普通旅人」。" : `当前生效：${active.name}。`)) : (0, react.createElement)("div", { className: "dshtavern-wb-editor" }, (0, react.createElement)("div", { className: "dshtavern-wb-editor-head" }, (0, react.createElement)("div", { className: "dshtavern-wb-editor-title" }, (0, react.createElement)("div", { className: "dshtavern-wb-heading" }, selected.id === "" ? "新建人设" : selected.name || "未命名"), (0, react.createElement)("div", { className: "dshtavern-wb-hint" }, selected.id === "" ? "保存后写入 .dshtavern/persona.json" : selected.id === state.activeId ? "当前生效中" : `id ${selected.id.slice(0, 8)}`)), (0, react.createElement)("div", { className: "dshtavern-wb-actions" }, selected.id === "" || selected.id === state.activeId ? null : (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled: state.saving,
				onClick: () => onActivate(selected.id)
			}, "设为预设"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: state.saving,
				onClick: onSaveDraft
			}, state.saving ? "保存中…" : "保存"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				onClick: () => setDraft(null)
			}, "关闭"), selected.id === "" ? null : (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-danger",
				disabled: state.saving,
				onClick: () => onDelete(selected.id)
			}, "删除"))), (0, react.createElement)("div", { className: "dshtavern-wb-grid" }, Field({
				label: "名称",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					value: selected.name,
					placeholder: "角色会这样称呼你",
					onChange: (event) => update(draft, setDraft, { name: event.target.value })
				})
			}), Field({
				label: "标签（逗号分隔）",
				children: (0, react.createElement)("input", {
					className: "dshtavern-wb-input",
					value: selected.tags.join(", "),
					placeholder: "旅人, 剑士",
					onChange: (event) => update(draft, setDraft, { tags: splitTags(event.target.value) })
				})
			})), Field({
				label: "外观",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.description,
					rows: 3,
					placeholder: "年龄、衣着、外貌特征。",
					onChange: (event) => update(draft, setDraft, { description: event.target.value })
				})
			}), Field({
				label: "性格",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.personality,
					rows: 3,
					placeholder: "你待人接物的方式。",
					onChange: (event) => update(draft, setDraft, { personality: event.target.value })
				})
			}), Field({
				label: "背景",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.background,
					rows: 4,
					placeholder: "你从哪里来，为什么在这里。",
					onChange: (event) => update(draft, setDraft, { background: event.target.value })
				})
			}), Field({
				label: "说话方式",
				hint: "语气、口癖、称呼习惯。留空则按性格自然发挥。",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.speakingStyle,
					rows: 3,
					placeholder: "说话简短，习惯用敬语。",
					onChange: (event) => update(draft, setDraft, { speakingStyle: event.target.value })
				})
			}), Field({
				label: "角色设定",
				hint: "能力、持有物、身份地位、债务与契约——除了来历之外，所有定义你状态的设定。",
				children: (0, react.createElement)("textarea", {
					className: "dshtavern-wb-textarea",
					value: selected.characterSheet,
					rows: 6,
					placeholder: "持有：一把旧短剑、半张矿镇地图。\n能力：能在黑暗里辨认方向。\n立场：与守林人有旧约。",
					onChange: (event) => update(draft, setDraft, { characterSheet: event.target.value })
				})
			}), (0, react.createElement)("div", { className: "dshtavern-wb-preview" }, (0, react.createElement)("div", { className: "dshtavern-wb-label" }, "进入提示词的内容"), (0, react.createElement)("pre", { className: "dshtavern-preview-system" }, preview)));
			return (0, react.createElement)("section", { className: "dshtavern-wb-panel" }, listPane, (0, react.createElement)("div", { className: "dshtavern-wb-main" }, state.error === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-error" }, state.error), state.notice === null ? null : (0, react.createElement)("div", { className: "dshtavern-banner-notice" }, state.notice), editor));
		}
		/** Apply one field patch to the draft. */
		function update(draft, setDraft, patch) {
			if (draft === null) return;
			setDraft({
				...draft,
				...patch
			});
		}
		/** Split a comma-separated tag field. */
		function splitTags(value) {
			return value.split(/[,，]/).map((part) => part.trim()).filter((part) => part.length > 0);
		}
		//#endregion
		//#region src/client/stats.ts
		/**
		* Usage panel for the tavern toolbox.
		*
		* Renders one tavern workspace's token spend, the current session's spend,
		* context occupancy, and cache-hit rate. Every figure is served by the
		* `dshtavern-stats` sub-plugin's loopback route; this module only formats and
		* lays them out.
		*/
		/** How often the panel re-reads live counters. */
		const REFRESH_MS$1 = 1e4;
		/**
		* Format a token count the way the rest of the UI does.
		* @param value - raw count.
		* @returns `—` for an absent value, otherwise a compact number.
		*/
		function formatTokens(value) {
			if (value === void 0) return "—";
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${(value / 1e3).toFixed(value < 1e4 ? 2 : 1)}k`;
			return `${(value / 1e6).toFixed(2)}M`;
		}
		/**
		* Format a 0..1 ratio as a percentage.
		* @param value - ratio, or undefined when unknown.
		* @returns `—` or a one-decimal percentage.
		*/
		function formatPercent(value) {
			if (value === void 0 || !Number.isFinite(value)) return "—";
			return `${(value * 100).toFixed(value < .1 ? 2 : 1)}%`;
		}
		/** Read one snapshot from the stats sub-plugin. */
		async function fetchUsage(workspaceId, sessionId) {
			const params = new URLSearchParams({ workspaceId });
			if (sessionId.length > 0) params.set("sessionId", sessionId);
			const response = await fetch(`/tavern-stats/state?${params.toString()}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			});
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`用量统计不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("用量统计返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `用量统计请求失败（HTTP ${response.status}）`);
			return record;
		}
		/** One labelled figure. */
		function Metric(props) {
			return (0, react.createElement)("div", { className: "dshtavern-usage-metric" }, (0, react.createElement)("span", { className: "dshtavern-usage-metric-label" }, props.label), (0, react.createElement)("span", { className: "dshtavern-usage-metric-value" }, props.value), props.hint === void 0 ? null : (0, react.createElement)("span", { className: "dshtavern-usage-metric-hint" }, props.hint));
		}
		/** A labelled progress bar; `ratio` absent renders a muted empty track. */
		function Meter(props) {
			const percent = props.ratio === void 0 ? 0 : Math.round(props.ratio * 1e3) / 10;
			const tone = props.ratio === void 0 ? "muted" : percent >= 85 ? "hot" : percent >= 60 ? "warm" : "ok";
			return (0, react.createElement)("div", { className: "dshtavern-usage-meter" }, (0, react.createElement)("div", { className: "dshtavern-usage-meter-head" }, (0, react.createElement)("span", { className: "dshtavern-usage-metric-label" }, props.label), (0, react.createElement)("span", { className: "dshtavern-usage-meter-value" }, props.value)), (0, react.createElement)("div", {
				className: "dshtavern-usage-meter-track",
				role: "progressbar",
				"aria-valuenow": percent,
				"aria-valuemin": 0,
				"aria-valuemax": 100,
				"aria-label": props.label,
				"data-tone": tone
			}, (0, react.createElement)("div", {
				className: "dshtavern-usage-meter-fill",
				style: { width: `${Math.min(100, Math.max(0, percent))}%` }
			})), (0, react.createElement)("div", { className: "dshtavern-usage-meter-caption" }, props.detail));
		}
		/**
		* Workspace and session usage, refreshed while the panel is open.
		* @param props - the workspace and session the toolbox opened for.
		* @returns the usage section.
		*/
		function UsagePanel(props) {
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const load = (0, react.useCallback)(async (quiet) => {
				if (!quiet) setLoading(true);
				try {
					setSnapshot(await fetchUsage(props.workspaceId, props.sessionId));
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setLoading(false);
				}
			}, [props.workspaceId, props.sessionId]);
			(0, react.useEffect)(() => {
				load(false);
				const timer = window.setInterval(() => {
					load(true);
				}, REFRESH_MS$1);
				return () => window.clearInterval(timer);
			}, [load]);
			if (error !== null && snapshot === null) return (0, react.createElement)("section", { className: "dshtavern-usage" }, (0, react.createElement)("div", { className: `${CLASS.bannerError} dshtavern-usage-error` }, `用量统计未启用或不可用：${error}`, (0, react.createElement)("div", { className: "dshtavern-usage-error-hint" }, "确认 profile 中已安装并启用 dshtavern-stats 子插件（cordis.patch.yml 的对应行未被禁用）。")), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				onClick: () => {
					load(false);
				}
			}, "重试"));
			if (snapshot === null) return (0, react.createElement)("section", { className: "dshtavern-usage" }, (0, react.createElement)("div", {
				className: CLASS.hint,
				style: { padding: "8px 2px" }
			}, loading ? "读取用量…" : "暂无用量数据"));
			const totals = snapshot.totals;
			const current = snapshot.current;
			const context = current?.context;
			const totalHitRate = totals.cacheHitRate;
			const contextDetail = context?.usedTokens === void 0 ? "尚无请求采样" : `${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)} tokens`;
			const hitDetail = totals.cacheHitRate === void 0 ? "尚无 prompt token" : `缓存读 ${formatTokens(totals.cacheReadTokens)} · 未缓存 ${formatTokens(totals.uncachedInputTokens)}`;
			const inputOf = (bucket) => formatTokens(bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens);
			return (0, react.createElement)("section", { className: "dshtavern-usage" }, (0, react.createElement)("div", { className: "dshtavern-usage-cards" }, (0, react.createElement)("div", { className: "dshtavern-usage-card" }, (0, react.createElement)("div", { className: "dshtavern-usage-card-title" }, "工作区总量"), (0, react.createElement)("div", { className: "dshtavern-usage-card-grid" }, (0, react.createElement)(Metric, {
				label: "Tokens",
				value: formatTokens(totals.totalTokens),
				hint: `${totals.sessionCount} 个会话`
			}), (0, react.createElement)(Metric, {
				label: "输入 / 输出",
				value: `${inputOf(totals)} / ${formatTokens(totals.outputTokens)}`,
				hint: `缓存写 ${formatTokens(totals.cacheWriteTokens)}`
			}))), (0, react.createElement)("div", { className: "dshtavern-usage-card" }, (0, react.createElement)("div", { className: "dshtavern-usage-card-title" }, "当前会话"), (0, react.createElement)("div", { className: "dshtavern-usage-card-grid" }, (0, react.createElement)(Metric, {
				label: "Tokens",
				value: formatTokens(current?.totalTokens),
				hint: current?.title ?? (current === void 0 ? "不在本工作区" : "本会话")
			}), (0, react.createElement)(Metric, {
				label: "输入 / 输出",
				value: current === void 0 ? "—" : `${inputOf(current.buckets)} / ${formatTokens(current.buckets.outputTokens)}`,
				hint: current === void 0 ? void 0 : `缓存读 ${formatTokens(current.buckets.cacheReadTokens)}`
			})))), (0, react.createElement)("div", { className: "dshtavern-usage-meters" }, (0, react.createElement)(Meter, {
				label: "上下文使用",
				ratio: context?.ratio,
				value: context?.ratio === void 0 ? "—" : formatPercent(context.ratio),
				detail: contextDetail
			}), (0, react.createElement)(Meter, {
				label: "缓存命中率",
				ratio: totalHitRate,
				value: totalHitRate === void 0 ? "—" : formatPercent(totalHitRate),
				detail: hitDetail
			})), snapshot.projectionsAvailable ? null : (0, react.createElement)("div", { className: `${CLASS.bannerNotice} dshtavern-usage-notice` }, "当前 profile 未注册 token-meter 投影，token 与上下文数据不可用；安装 @deepseek-ai/dsh-token-meter 后重启。"), snapshot.sessions.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-usage-empty" }, "这个工作区还没有运行中的会话。") : (0, react.createElement)("div", { className: "dshtavern-usage-sessions" }, (0, react.createElement)("div", { className: "dshtavern-usage-session-row dshtavern-usage-session-head" }, (0, react.createElement)("span", { className: "dshtavern-usage-session-title" }, `会话（${snapshot.sessions.length}）`), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, "Tokens"), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, "命中"), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, "上下文")), snapshot.sessions.map((session) => (0, react.createElement)("div", {
				key: session.sessionId,
				className: "dshtavern-usage-session-row",
				"data-current": session.sessionId === props.sessionId ? "true" : "false"
			}, (0, react.createElement)("span", {
				className: "dshtavern-usage-session-title",
				title: session.sessionId
			}, session.title ?? session.sessionId.slice(0, 18)), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, formatTokens(session.totalTokens)), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, formatPercent(session.cacheHitRate)), (0, react.createElement)("span", { className: "dshtavern-usage-session-cell" }, formatPercent(session.context.ratio))))), (0, react.createElement)("div", { className: "dshtavern-usage-foot" }, (0, react.createElement)("span", null, "仅统计运行中的会话"), (0, react.createElement)("span", { className: "dshtavern-usage-foot-time" }, `每 10 秒刷新 · 采样于 ${snapshot.generatedAt.replace("T", " ").slice(11, 19)}`)));
		}
		//#endregion
		//#region src/client/tracker.ts
		/**
		* Story tracker panel for the tavern toolbox.
		*
		* Three sub-pages behind one tab strip: the newest ledger, the run history, and
		* the settings. A run happens on the host's own schedule; this panel only
		* configures it and reads the result, so opening it never spends a model call.
		* The newest ledger is separated from the rest because that is what a player
		* checks while playing — the history is for going back, not for skimming.
		*/
		/** Bounds mirrored from the host so the inputs can clamp in place. */
		const TRACKER_LIMITS = {
			everyTurns: {
				min: 1,
				max: 200,
				unit: "轮"
			},
			everyMinutes: {
				min: 1,
				max: 10080,
				unit: "分钟"
			},
			maxTranscriptChars: {
				min: 2e3,
				max: 8e5,
				unit: "字"
			},
			worldChars: {
				min: 60,
				max: 4e3,
				unit: "字"
			},
			characterChars: {
				min: 40,
				max: 2e3,
				unit: "字"
			},
			userChars: {
				min: 40,
				max: 2e3,
				unit: "字"
			}
		};
		/**
		* Ready-made length budgets.
		*
		* Three sizes rather than a single slider per field: the useful question is
		* "how much summary do I want", not "how many characters should the world
		* section be". Each preset scales the three categories together, keeping the
		* ratio the defaults established.
		*/
		const LENGTH_PRESETS = {
			short: {
				label: "精简",
				hint: "几句话说清现状",
				world: 150,
				character: 100,
				user: 80
			},
			standard: {
				label: "标准",
				hint: "默认，够回顾也能读完",
				world: 300,
				character: 180,
				user: 150
			},
			long: {
				label: "详细",
				hint: "保留更多细节",
				world: 600,
				character: 360,
				user: 300
			},
			deep: {
				label: "详尽",
				hint: "接近章节摘要",
				world: 1200,
				character: 700,
				user: 600
			}
		};
		/**
		* Which preset a set of budgets currently matches.
		* @param lengths - configured budgets.
		* @returns the preset id, or `undefined` for a custom mix.
		*/
		function lengthPresetOf(lengths) {
			for (const [id, preset] of Object.entries(LENGTH_PRESETS)) if (preset.world === lengths.world.suggested && preset.character === lengths.character.suggested && preset.user === lengths.user.suggested) return id;
		}
		/** How often the panel re-reads run state while open. */
		const REFRESH_MS = 15e3;
		function errorText$1(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`回顾接口不可用（HTTP ${response.status}）`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("回顾接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `回顾请求失败（HTTP ${response.status}）`);
			return record;
		}
		/** Read one workspace's tracker snapshot. */
		async function loadSnapshot(workspaceId) {
			return await readJson(await fetch(`/tavern-tracker/state?workspaceId=${encodeURIComponent(workspaceId)}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
		}
		/** Persist one workspace's tracker settings. */
		async function saveConfig(workspaceId, body) {
			return (await readJson(await fetch("/tavern-tracker/state", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					action: "save",
					...body
				})
			}))).config;
		}
		/** Start one tracking run for a chat. */
		async function startTracking(workspaceId, sessionId) {
			const payload = await readJson(await fetch("/tavern-tracker/state", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					action: "track",
					sessionId
				})
			}));
			return {
				started: payload.started === true,
				...typeof payload.reason === "string" ? { reason: payload.reason } : {}
			};
		}
		/**
		* One line of the status card: what tracking is doing right now.
		*
		* The status is the first thing a reader wants, so it is a sentence rather than
		* a row of pills: "next run after 3 more beats" answers the question a knob
		* cannot.
		* @param props - config and the current chat, when one is selected.
		* @returns the status sentence.
		*/
		function trackerStatusText(config, chat) {
			if (!config.enabled) return "自动回顾已关闭，只能在下面手动点「立即回顾」。";
			const schedule = config.trigger === "turns" ? `每新增 ${config.everyTurns} 轮` : `每 ${config.everyMinutes} 分钟`;
			if (chat === void 0) return `${schedule}回顾一次。`;
			const trackedThrough = chat.trackedTurns.length === 0 ? 0 : Math.max(...chat.trackedTurns);
			if (config.trigger === "turns") {
				const pending = Math.max(0, chat.newestTurn - trackedThrough);
				const remaining = Math.max(0, config.everyTurns - pending);
				return `${schedule}回顾一次。已到第 ${chat.newestTurn} 轮${trackedThrough === 0 ? "" : `（上次第 ${trackedThrough} 轮）`}，` + (remaining === 0 ? "下一次很快就会运行。" : `再新增 ${remaining} 轮后运行。`);
			}
			return `${schedule}回顾一次。当前已到第 ${chat.newestTurn} 轮。`;
		}
		/** One labelled number input with its unit and bounds. */
		function NumberRow(props) {
			return (0, react.createElement)("label", { className: "dshtavern-tracker-row" }, (0, react.createElement)("span", { className: "dshtavern-tracker-row-text" }, (0, react.createElement)("span", { className: "dshtavern-tracker-label" }, props.label), (0, react.createElement)("span", { className: "dshtavern-tracker-hint" }, props.hint)), (0, react.createElement)("span", { className: "dshtavern-tracker-input-wrap" }, (0, react.createElement)("input", {
				className: "dshtavern-tracker-input",
				type: "number",
				min: props.bounds.min,
				max: props.bounds.max,
				value: String(props.value),
				disabled: props.disabled,
				onChange: (event) => {
					const parsed = Number(event.target.value);
					if (!Number.isFinite(parsed)) return;
					props.onChange(Math.min(props.bounds.max, Math.max(props.bounds.min, Math.round(parsed))));
				}
			}), (0, react.createElement)("span", { className: "dshtavern-tracker-unit" }, props.bounds.unit)));
		}
		/**
		* The two schedule options, as one choice rather than two switches.
		* @param props - current choice and the change handler.
		* @returns the radio group.
		*/
		function TriggerPicker(props) {
			return (0, react.createElement)("div", {
				className: "dshtavern-tracker-triggers",
				role: "radiogroup",
				"aria-label": "自动触发方式"
			}, [{
				id: "turns",
				name: "按轮次",
				hint: "每新增 N 轮跑一次"
			}, {
				id: "minutes",
				name: "按时间",
				hint: "每隔 N 分钟跑一次"
			}].map((option) => (0, react.createElement)("button", {
				key: option.id,
				type: "button",
				role: "radio",
				"aria-checked": props.trigger === option.id,
				"data-active": props.trigger === option.id,
				className: "dshtavern-tracker-trigger",
				disabled: props.disabled,
				onClick: () => props.onChange(option.id)
			}, (0, react.createElement)("span", { className: "dshtavern-tracker-trigger-name" }, option.name), (0, react.createElement)("span", { className: "dshtavern-tracker-trigger-hint" }, option.hint))));
		}
		/**
		* One ledger, rendered as world → player → characters.
		*
		* The player entry comes second because it is the reader's own position, and
		* the cast's view of them depends on it; older ledgers without one simply skip
		* the section.
		* @param props - the ledger and whether it is the newest.
		* @returns the card element.
		*/
		function SummaryCard(props) {
			const summary = props.summary;
			return (0, react.createElement)("article", { className: props.newest === true ? "dshtavern-tracker-summary dshtavern-tracker-summary-newest" : "dshtavern-tracker-summary" }, (0, react.createElement)("header", { className: "dshtavern-tracker-summary-head" }, (0, react.createElement)("span", { className: "dshtavern-tracker-badge" }, `第 ${summary.turn} 轮`), (0, react.createElement)("span", { className: "dshtavern-tracker-hint" }, `${summary.at.replace("T", " ").slice(0, 16)}${summary.model === void 0 ? "" : ` · ${summary.model}`}`), (0, react.createElement)("span", { className: "dshtavern-tracker-hint dshtavern-tracker-summary-size" }, `${summary.transcriptChars} 字全文`)), (0, react.createElement)("div", { className: "dshtavern-tracker-section" }, (0, react.createElement)("div", { className: "dshtavern-tracker-section-title" }, "世界"), (0, react.createElement)("p", { className: "dshtavern-tracker-text" }, summary.world)), ...summary.user === void 0 ? [] : [(0, react.createElement)("div", {
				key: "user",
				className: "dshtavern-tracker-section"
			}, (0, react.createElement)("div", { className: "dshtavern-tracker-section-title" }, "你"), (0, react.createElement)("p", { className: "dshtavern-tracker-text" }, summary.user.progress))], ...summary.characters.length === 0 ? [] : [(0, react.createElement)("div", {
				key: "chars",
				className: "dshtavern-tracker-section"
			}, (0, react.createElement)("div", { className: "dshtavern-tracker-section-title" }, `角色（${summary.characters.length}）`), ...summary.characters.map((entry) => (0, react.createElement)("div", {
				key: entry.name,
				className: "dshtavern-tracker-entry"
			}, (0, react.createElement)("span", { className: "dshtavern-tracker-entry-name" }, entry.name), (0, react.createElement)("p", { className: "dshtavern-tracker-text" }, entry.progress))))]);
		}
		/**
		* The length presets, as one row of choices.
		*
		* Picking one replaces all three budgets at once, because they only make sense
		* relative to each other: a detailed world with a terse character entry reads
		* as if the cast barely matters.
		* @param props - current budgets and the change handler.
		* @returns the preset row.
		*/
		function LengthPicker(props) {
			const active = lengthPresetOf(props.lengths);
			return (0, react.createElement)("div", {
				className: "dshtavern-tracker-presets",
				role: "radiogroup",
				"aria-label": "摘要篇幅预设"
			}, Object.entries(LENGTH_PRESETS).map(([id, preset]) => (0, react.createElement)("button", {
				key: id,
				type: "button",
				role: "radio",
				"aria-checked": active === id,
				"data-active": active === id,
				className: "dshtavern-tracker-preset",
				disabled: props.disabled,
				title: `世界 ${preset.world} 字 · 玩家 ${preset.user} 字 · 每个角色 ${preset.character} 字`,
				onClick: () => props.onChange({
					world: { suggested: preset.world },
					character: { suggested: preset.character },
					user: { suggested: preset.user }
				})
			}, (0, react.createElement)("span", { className: "dshtavern-tracker-preset-name" }, preset.label), (0, react.createElement)("span", { className: "dshtavern-tracker-preset-hint" }, preset.hint))));
		}
		/**
		* Story tracker: newest ledger, run history, and settings behind one tab strip.
		* @param props - the workspace and chat the toolbox opened for.
		* @returns the tracker section.
		*/
		function TrackerPanel(props) {
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [activeTab, setActiveTab] = (0, react.useState)("latest");
			const load = (0, react.useCallback)(async (quiet = false) => {
				if (!quiet) setLoading(true);
				try {
					const next = await loadSnapshot(props.workspaceId);
					setSnapshot(next);
					setDraft((current) => current === null ? next.config : current);
					setError(null);
				} catch (cause) {
					setError(errorText$1(cause));
				} finally {
					setLoading(false);
				}
			}, [props.workspaceId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					load(true);
				}, REFRESH_MS);
				return () => window.clearInterval(timer);
			}, [load]);
			const persist = (0, react.useCallback)(async (next, reset = false) => {
				setSaving(true);
				setError(null);
				setNotice(null);
				try {
					const stored = await saveConfig(props.workspaceId, reset ? { reset: true } : { config: next });
					setDraft(stored);
					setSnapshot((current) => current === null ? current : {
						...current,
						config: stored
					});
					setNotice(reset ? "已恢复默认设置" : "已保存回顾设置");
				} catch (cause) {
					setError(errorText$1(cause));
				} finally {
					setSaving(false);
				}
			}, [props.workspaceId]);
			const trackNow = (0, react.useCallback)(async () => {
				setError(null);
				setNotice(null);
				try {
					const result = await startTracking(props.workspaceId, props.sessionId);
					setNotice(result.started ? "已开始回顾，完成后会出现在下方" : result.reason ?? "回顾没有开始");
					await load(true);
				} catch (cause) {
					setError(errorText$1(cause));
				}
			}, [
				load,
				props.workspaceId,
				props.sessionId
			]);
			if (loading && snapshot === null) return (0, react.createElement)("section", { className: "dshtavern-tracker" }, (0, react.createElement)("div", {
				className: CLASS.hint,
				style: { padding: "10px 2px" }
			}, "读取回顾状态…"));
			if (snapshot === null || draft === null) return (0, react.createElement)("section", { className: "dshtavern-tracker" }, (0, react.createElement)("div", { className: CLASS.bannerError }, error ?? "无法读取回顾状态"), (0, react.createElement)("button", {
				type: "button",
				className: CLASS.button,
				onClick: () => {
					load();
				}
			}, "重试"));
			const current = (snapshot.chats.find((chat) => chat.sessionId === props.sessionId) === void 0 ? snapshot.chats : [snapshot.chats.find((chat) => chat.sessionId === props.sessionId), ...snapshot.chats.filter((chat) => chat.sessionId !== props.sessionId)])[0];
			const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.config);
			const staleCovered = current?.staleTurns ?? [];
			const tab = activeTab;
			const latest = current?.summaries[0];
			const history = current?.summaries.slice(1) ?? [];
			/** Newest ledger only: what a player checks while playing. */
			const latestPane = (0, react.createElement)(SubTabPane, null, current === void 0 || latest === void 0 ? (0, react.createElement)("div", { className: "dshtavern-tracker-empty" }, current === void 0 ? "这个工作区还没有可以回顾的聊天。" : "还没有回顾记录。点上面的「立即回顾」生成第一份。") : (0, react.createElement)(SummaryCard, {
				summary: latest,
				newest: true
			}), current?.lastError === void 0 ? null : (0, react.createElement)("div", { className: "dshtavern-tracker-error" }, current.lastError));
			/** Older ledgers, newest first. */
			const historyPane = (0, react.createElement)(SubTabPane, null, history.length === 0 ? (0, react.createElement)("div", { className: "dshtavern-tracker-empty" }, "还没有更早的回顾记录。") : history.map((summary) => (0, react.createElement)(SummaryCard, {
				key: summary.turn,
				summary
			})));
			/** Settings: schedule, transcript ceiling, and the per-category budgets. */
			const settingsPane = (0, react.createElement)(SubTabPane, null, (0, react.createElement)("div", { className: "dshtavern-tracker-group" }, (0, react.createElement)("div", { className: "dshtavern-tracker-group-head" }, (0, react.createElement)("div", { className: "dshtavern-tracker-group-title" }, "自动回顾"), (0, react.createElement)("span", {
				className: "dshtavern-tracker-badge",
				"data-tone": dirty ? "warn" : "ok"
			}, saving ? "保存中…" : dirty ? "有未保存的修改" : "已保存")), (0, react.createElement)("div", { className: "dshtavern-tracker-group-note" }, "回顾在后台独立运行，不占用本回合的模型调用。每次都会把从开场到现在的完整剧情读一遍，重写成一份当前状态的摘要。"), (0, react.createElement)("label", { className: "dshtavern-tracker-row dshtavern-tracker-row-toggle" }, (0, react.createElement)("span", { className: "dshtavern-tracker-row-text" }, (0, react.createElement)("span", { className: "dshtavern-tracker-label" }, "启用自动回顾"), (0, react.createElement)("span", { className: "dshtavern-tracker-hint" }, "关闭后只在手动点「立即回顾」时运行。")), (0, react.createElement)("span", { className: "dshtavern-switch" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: draft.enabled,
				disabled: saving,
				onChange: () => setDraft({
					...draft,
					enabled: !draft.enabled
				})
			}), (0, react.createElement)("span", {
				className: "dshtavern-switch-track",
				"aria-hidden": true
			}, (0, react.createElement)("span", { className: "dshtavern-switch-thumb" })))), (0, react.createElement)(TriggerPicker, {
				trigger: draft.trigger,
				disabled: saving || !draft.enabled,
				onChange: (trigger) => setDraft({
					...draft,
					trigger
				})
			}), draft.trigger === "turns" ? (0, react.createElement)(NumberRow, {
				label: "每 N 轮",
				hint: "按新增的轮次计算：上次回顾之后又发生了几轮，达到这个数就运行一次。",
				value: draft.everyTurns,
				bounds: TRACKER_LIMITS.everyTurns,
				disabled: saving || !draft.enabled,
				onChange: (value) => setDraft({
					...draft,
					everyTurns: value
				})
			}) : (0, react.createElement)(NumberRow, {
				label: "每 N 分钟",
				hint: "按真实时间计算，与轮次无关；这段时间里没有新剧情就跳过。",
				value: draft.everyMinutes,
				bounds: TRACKER_LIMITS.everyMinutes,
				disabled: saving || !draft.enabled,
				onChange: (value) => setDraft({
					...draft,
					everyMinutes: value
				})
			}), (0, react.createElement)(NumberRow, {
				label: "全文上限",
				hint: "完整剧情超过这个字数时，从最旧的部分开始丢弃。留给最后注入的系统提示词与摘要本身。",
				value: draft.maxTranscriptChars,
				bounds: TRACKER_LIMITS.maxTranscriptChars,
				disabled: saving,
				onChange: (value) => setDraft({
					...draft,
					maxTranscriptChars: value
				})
			})), (0, react.createElement)("div", { className: "dshtavern-tracker-group" }, (0, react.createElement)("div", { className: "dshtavern-tracker-group-head" }, (0, react.createElement)("div", { className: "dshtavern-tracker-group-title" }, "摘要篇幅"), (0, react.createElement)("span", { className: "dshtavern-tracker-hint" }, "建议字数；模型超出这个篇幅时会被裁掉")), (0, react.createElement)("div", { className: "dshtavern-tracker-group-note" }, "三部分各自独立计字。调小更省 token、更容易扫读；调大能留住更多细节，但下一轮的提示词也会更长。"), (0, react.createElement)(LengthPicker, {
				lengths: draft.lengths,
				disabled: saving,
				onChange: (lengths) => setDraft({
					...draft,
					lengths
				})
			}), (0, react.createElement)(NumberRow, {
				label: "世界",
				hint: "地点、正在发生的事、还没解决的线索。",
				value: draft.lengths.world.suggested,
				bounds: TRACKER_LIMITS.worldChars,
				disabled: saving,
				onChange: (value) => setDraft({
					...draft,
					lengths: {
						...draft.lengths,
						world: { suggested: value }
					}
				})
			}), (0, react.createElement)(NumberRow, {
				label: "你（玩家）",
				hint: "玩家已经表明的身份、做过并被看见的事、角色现在怎么看玩家。",
				value: draft.lengths.user.suggested,
				bounds: TRACKER_LIMITS.userChars,
				disabled: saving,
				onChange: (value) => setDraft({
					...draft,
					lengths: {
						...draft.lengths,
						user: { suggested: value }
					}
				})
			}), (0, react.createElement)(NumberRow, {
				label: "每个角色",
				hint: "每个角色各自的上限，不是全部角色加起来。",
				value: draft.lengths.character.suggested,
				bounds: TRACKER_LIMITS.characterChars,
				disabled: saving,
				onChange: (value) => setDraft({
					...draft,
					lengths: {
						...draft.lengths,
						character: { suggested: value }
					}
				})
			})), (0, react.createElement)("div", { className: "dshtavern-tracker-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled: saving,
				onClick: () => {
					persist(draft, true);
				}
			}, "恢复默认"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: saving || !dirty,
				onClick: () => {
					persist(draft);
				}
			}, "保存")));
			return (0, react.createElement)("section", { className: "dshtavern-tracker" }, (0, react.createElement)("div", { className: "dshtavern-tracker-card dshtavern-tracker-status" }, (0, react.createElement)("div", { className: "dshtavern-tracker-status-main" }, (0, react.createElement)("span", {
				className: "dshtavern-tracker-dot",
				"data-tone": !draft.enabled ? "off" : staleCovered.length > 0 ? "warn" : "on",
				"aria-hidden": true
			}), (0, react.createElement)("span", { className: "dshtavern-tracker-status-text" }, trackerStatusText(draft, current))), (0, react.createElement)("div", { className: "dshtavern-tracker-status-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled: saving,
				onClick: () => {
					load();
				}
			}, "刷新"), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button dshtavern-button-primary",
				disabled: saving || current === void 0 || current.running || current.newestTurn === 0,
				onClick: () => {
					trackNow();
				}
			}, current?.running === true ? "回顾中…" : "立即回顾"))), error === null ? null : (0, react.createElement)("div", { className: CLASS.bannerError }, error), notice === null ? null : (0, react.createElement)("div", { className: CLASS.bannerNotice }, notice), staleCovered.length === 0 ? null : (0, react.createElement)("div", { className: "dshtavern-tracker-stale" }, (0, react.createElement)("span", { className: "dshtavern-tracker-stale-title" }, "摘要已过期"), (0, react.createElement)("span", null, `第 ${staleCovered.join("、")} 轮被重新生成取代，现有摘要是按旧剧情写的。`), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-button",
				disabled: saving || current?.running === true,
				onClick: () => {
					trackNow();
				}
			}, "重新回顾")), (0, react.createElement)(SubTabs, {
				ariaLabel: "回顾页面",
				active: tab,
				tabs: [
					{
						id: "latest",
						label: "最新回顾"
					},
					{
						id: "history",
						label: history.length === 0 ? "历史记录" : `历史记录（${history.length}）`,
						disabled: history.length === 0,
						...history.length === 0 ? { hint: "还没有更早的回顾" } : {}
					},
					{
						id: "settings",
						label: "设置",
						changed: dirty
					}
				],
				onSelect: (id) => setActiveTab(id)
			}), tab === "latest" ? latestPane : null, tab === "history" ? historyPane : null, tab === "settings" ? settingsPane : null);
		}
		//#endregion
		//#region src/client/tracked-marks.ts
		/**
		* Green marks on the turn rail for beats that already have a ledger.
		*
		* The chat UI owns the rail and exposes no slot for decorating a mark, so this
		* observes the rendered `button[data-index]` marks and sets one attribute the
		* stylesheet turns green. Matching is by turn number read from the mark's
		* accessible label, which is the only per-turn fact the rail publishes.
		*/
		/** Attribute set on a rail mark whose turn has been tracked. */
		const TRACKED_MARK_ATTRIBUTE = "data-dshtavern-tracked";
		/** Stylesheet element id, so a second install cannot duplicate the rules. */
		const STYLE_ID$2 = "dshtavern-tracked-marks";
		/** Rules that colour a tracked mark. */
		const TRACKED_CSS = `
[${TRACKED_MARK_ATTRIBUTE}='true'] {
  background-color: var(--dsw-alias-state-success-primary, #3ba55d) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary, #3ba55d) 22%, transparent);
}
`;
		/** Turns known to have a ledger, per chat. */
		const trackedBySession = /* @__PURE__ */ new Map();
		/** Turns whose ledger no longer matches the story, per chat. */
		const staleBySession = /* @__PURE__ */ new Map();
		/**
		* Read the turn number out of a rail mark's label.
		*
		* The label is a localized sentence ("跳转到第 3 轮" / "Jump to turn 3"), so the
		* number is taken as the last integer in it rather than by matching the whole
		* string, which would break on a copy change or a second language.
		* @param label - the mark's `aria-label`.
		* @returns the turn number, or `undefined` when the label carries none.
		*/
		function turnOfLabel(label) {
			if (label === null) return void 0;
			const matches = label.match(/\d+/g);
			if (matches === null) return void 0;
			const last = matches[matches.length - 1];
			if (last === void 0) return void 0;
			const turn = Number(last);
			return Number.isSafeInteger(turn) && turn > 0 ? turn : void 0;
		}
		/**
		* Apply the mark to every rendered rail mark.
		*
		* A turn that was regenerated after its ledger was written keeps no mark: the
		* ledger describes a story that no longer exists, and a green dot would claim
		* otherwise.
		* @param tracked - turns that have a current ledger.
		*/
		function markTrackedTurns(tracked) {
			if (typeof document === "undefined") return;
			for (const mark of document.querySelectorAll("button[data-index]")) {
				const turn = turnOfLabel(mark.getAttribute("aria-label"));
				if (turn !== void 0 && tracked.has(turn)) {
					mark.setAttribute(TRACKED_MARK_ATTRIBUTE, "true");
					continue;
				}
				mark.removeAttribute(TRACKED_MARK_ATTRIBUTE);
			}
		}
		/**
		* Record one chat's tracked turns and repaint the rail.
		* @param sessionId - chat identity the rail is showing.
		* @param turns - turns that have a ledger.
		*/
		function setTrackedTurns(sessionId, turns) {
			const next = new Set(turns);
			const previous = trackedBySession.get(sessionId);
			if (previous !== void 0 && previous.size === next.size && [...next].every((turn) => previous.has(turn))) {
				markTrackedTurns(effectiveTracked(sessionId));
				return;
			}
			trackedBySession.set(sessionId, next);
			markTrackedTurns(effectiveTracked(sessionId));
		}
		/**
		* Record which covered turns a regeneration invalidated.
		* @param sessionId - chat identity.
		* @param turns - superseded turns.
		*/
		function setStaleTurns(sessionId, turns) {
			const next = new Set(turns);
			const previous = staleBySession.get(sessionId);
			if (previous !== void 0 && previous.size === next.size && [...next].every((turn) => previous.has(turn))) return;
			staleBySession.set(sessionId, next);
			markTrackedTurns(effectiveTracked(sessionId));
		}
		/**
		* Turns that should still be marked for one chat.
		* @param sessionId - chat identity.
		* @returns tracked turns minus the ones a replay invalidated.
		*/
		function effectiveTracked(sessionId) {
			const tracked = trackedBySession.get(sessionId) ?? /* @__PURE__ */ new Set();
			const stale = staleBySession.get(sessionId);
			if (stale === void 0 || stale.size === 0) return tracked;
			const effective = /* @__PURE__ */ new Set();
			for (const turn of tracked) if (!stale.has(turn)) effective.add(turn);
			return effective;
		}
		/**
		* Keep the rail marks in sync with the tracker.
		*
		* Repaints on tracker changes and after sidebar/transcript mutations, because
		* the rail is virtualized: scrolling rebuilds the marks and drops attributes.
		* @param sessionId - chat identity the rail is showing.
		* @returns a disposer that stops observing.
		*/
		function installTrackedTurnMarks(sessionId) {
			if (typeof document === "undefined") return () => void 0;
			if (document.getElementById(STYLE_ID$2) === null) {
				const style = document.createElement("style");
				style.id = STYLE_ID$2;
				style.textContent = TRACKED_CSS;
				document.head.appendChild(style);
			}
			const repaint = () => {
				markTrackedTurns(effectiveTracked(sessionId));
			};
			repaint();
			const observer = new MutationObserver(repaint);
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["data-index", "aria-label"]
			});
			return () => {
				observer.disconnect();
				document.getElementById(STYLE_ID$2)?.remove();
				trackedBySession.delete(sessionId);
				staleBySession.delete(sessionId);
				for (const mark of document.querySelectorAll(`[${TRACKED_MARK_ATTRIBUTE}]`)) mark.removeAttribute(TRACKED_MARK_ATTRIBUTE);
			};
		}
		/**
		* Refresh one chat's tracked turns from the tracker route.
		*
		* A profile without the tracker sub-plugin has no route; that is a normal
		* state, so a failed read simply leaves the rail unmarked.
		* @param workspaceId - registered tavern workspace id.
		* @param sessionId - chat identity.
		*/
		async function refreshTrackedTurns(workspaceId, sessionId) {
			try {
				const body = await (await fetch(`/tavern-tracker/state?workspaceId=${encodeURIComponent(workspaceId)}`, {
					headers: { accept: "application/json" },
					cache: "no-store"
				})).json();
				if (body.ok !== true || !Array.isArray(body.chats)) return;
				for (const chat of body.chats) {
					if (typeof chat !== "object" || chat === null) continue;
					const record = chat;
					if (record.sessionId !== sessionId) continue;
					if (!Array.isArray(record.trackedTurns)) return;
					setTrackedTurns(sessionId, record.trackedTurns.filter((turn) => typeof turn === "number"));
					setStaleTurns(sessionId, Array.isArray(record.staleTurns) ? record.staleTurns.filter((turn) => typeof turn === "number") : []);
					return;
				}
			} catch {}
		}
		//#endregion
		//#region src/client/reply-to.ts
		/** Attribute set on a speech bubble's name paragraph. */
		const REPLY_TARGET_ATTRIBUTE = "data-dshtavern-reply";
		/** Stylesheet element id, so a second install cannot duplicate the rules. */
		const STYLE_ID$1 = "dshtavern-reply-targets";
		/**
		* Prefix the composer receives when the player picks a speaker.
		*
		* Reads as an addressed line rather than a script-style speaker tag, so the
		* player finishes a sentence ("对白鹭说，你先别动") instead of writing dialogue
		* in a transcript format.
		* @param name - the speaker being addressed.
		* @returns the prefilled prefix, ending where the player starts typing.
		*/
		function replyPrefix(name) {
			return `对${name}说：`;
		}
		/** Rules that make the name read as a control without moving anything. */
		const REPLY_CSS = `
[${REPLY_TARGET_ATTRIBUTE}='true'] {
  cursor: pointer;
  border-radius: var(--dsw-radius-sm, 8px);
  transition: background 140ms ease;
}
[${REPLY_TARGET_ATTRIBUTE}='true']:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f7fe0) 14%, transparent);
}
[${REPLY_TARGET_ATTRIBUTE}='true']:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f7fe0);
  outline-offset: 2px;
}
[${REPLY_TARGET_ATTRIBUTE}='true']::after {
  content: '回复';
  margin-inline-start: 6px;
  color: var(--dsw-alias-state-business-primary, #4f7fe0);
  font-size: 11px;
  font-weight: 400;
  opacity: 0;
  transition: opacity 140ms ease;
}
[${REPLY_TARGET_ATTRIBUTE}='true']:hover::after,
[${REPLY_TARGET_ATTRIBUTE}='true']:focus-visible::after {
  opacity: 1;
}
`;
		/**
		* Speaker name of the bubble one paragraph belongs to.
		*
		* The bubble is a blockquote whose first child paragraph holds only the name;
		* anything else in the transcript is narration or ordinary prose and is not a
		* reply target.
		* @param element - candidate paragraph.
		* @returns the name, or `undefined` when the element is not a bubble's name.
		*/
		function speakerNameOf(element) {
			const quote = element.closest("blockquote");
			if (quote === null) return void 0;
			const first = quote.firstElementChild;
			if (first !== element) return void 0;
			if (first.tagName !== "P") return void 0;
			const name = first.querySelector(":scope > strong:only-child")?.textContent?.trim() ?? "";
			return name.length > 0 ? name : void 0;
		}
		/**
		* Mark every bubble name in the transcript as a reply target.
		*
		* Idempotent and cheap: it only touches attributes, so a re-render that drops
		* them is repaired by the next observation rather than patched in place.
		*/
		function markReplyTargets() {
			if (typeof document === "undefined") return;
			for (const paragraph of document.querySelectorAll("blockquote > p:first-child")) {
				const name = speakerNameOf(paragraph);
				if (name === void 0) {
					paragraph.removeAttribute(REPLY_TARGET_ATTRIBUTE);
					continue;
				}
				paragraph.setAttribute(REPLY_TARGET_ATTRIBUTE, "true");
				paragraph.setAttribute("title", `回复${name}`);
				paragraph.setAttribute("role", "button");
				paragraph.setAttribute("tabindex", "0");
			}
		}
		/**
		* Pre-fill the composer so the next line is addressed to one character.
		* @param actions - the session's public input actions.
		* @param name - speaker name to prefix.
		*/
		function startReply(actions, name) {
			if (actions === void 0) return;
			actions.setDraft(replyPrefix(name));
			const editor = document.querySelector("[contenteditable=\"true\"]");
			if (editor === null) return;
			editor.focus();
			const range = document.createRange();
			range.selectNodeContents(editor);
			range.collapse(false);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
		/**
		* Keep bubble names clickable for the life of one mounted session view.
		*
		* One delegated listener handles every bubble, including ones rendered later,
		* so scrolling through history needs no per-element bookkeeping.
		* @param actions - the session's public input actions.
		* @returns a disposer that stops observing and removes the listener.
		*/
		function installReplyTargets(actions) {
			if (typeof document === "undefined") return () => void 0;
			if (document.getElementById(STYLE_ID$1) === null) {
				const style = document.createElement("style");
				style.id = STYLE_ID$1;
				style.textContent = REPLY_CSS;
				document.head.appendChild(style);
			}
			const activate = (target) => {
				if (!(target instanceof Element)) return;
				const paragraph = target.closest(`[${REPLY_TARGET_ATTRIBUTE}='true']`);
				if (paragraph === null) return;
				const name = speakerNameOf(paragraph);
				if (name !== void 0) startReply(actions, name);
			};
			const onClick = (event) => {
				activate(event.target);
			};
			const onKeyDown = (event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				if (!(event.target instanceof Element)) return;
				if (event.target.closest(`[data-dshtavern-reply='true']`) === null) return;
				event.preventDefault();
				activate(event.target);
			};
			document.addEventListener("click", onClick);
			document.addEventListener("keydown", onKeyDown);
			markReplyTargets();
			const observer = new MutationObserver(() => {
				markReplyTargets();
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			return () => {
				document.removeEventListener("click", onClick);
				document.removeEventListener("keydown", onKeyDown);
				observer.disconnect();
				document.getElementById(STYLE_ID$1)?.remove();
				for (const paragraph of document.querySelectorAll(`[${REPLY_TARGET_ATTRIBUTE}]`)) {
					paragraph.removeAttribute(REPLY_TARGET_ATTRIBUTE);
					paragraph.removeAttribute("title");
					paragraph.removeAttribute("role");
					paragraph.removeAttribute("tabindex");
				}
			};
		}
		//#endregion
		//#region src/client/toolbox.ts
		/**
		* Tavern playground toolbox.
		*
		* A floating, draggable launcher lives above the conversation (position is
		* remembered in `localStorage`). Clicking it opens an icon-only popover; a
		* tool tile then opens that tool's page in a separate sub-window. The launcher
		* is only present while the session runs inside a tavern workspace: a hidden
		* detector row in the composer publishes that station.
		*
		* The detector, launcher/popover and sub-window are separate slot
		* registrations in one client bundle, so they share a tiny module store.
		*/
		/** `localStorage` key remembering where the user dragged the launcher. */
		const FAB_POSITION_KEY = "dshtavern.toolbox.fab.v1";
		/** Clearance between the launcher and the viewport edges. */
		const FAB_MARGIN = 12;
		let state = {
			station: null,
			taverns: [],
			loaded: false,
			open: false,
			activeTool: null
		};
		const listeners$1 = /* @__PURE__ */ new Set();
		function notify$1() {
			for (const listener of listeners$1) listener();
		}
		function subscribe(listener) {
			listeners$1.add(listener);
			return () => {
				listeners$1.delete(listener);
			};
		}
		function snapshot() {
			return state;
		}
		let fetching = false;
		/** Refresh the tavern workspace list used to recognize a tavern session. */
		function ensureTaverns(force = false) {
			if (fetching) return;
			if (!force && state.loaded) return;
			fetching = true;
			fetch("/tavern/state", {
				headers: { accept: "application/json" },
				cache: "no-store"
			}).then(async (response) => {
				const body = await response.json();
				const taverns = [];
				for (const tavern of Array.isArray(body.taverns) ? body.taverns : []) {
					if (typeof tavern.workspaceId !== "string" || typeof tavern.path !== "string") continue;
					taverns.push({
						workspaceId: tavern.workspaceId,
						workspacePath: tavern.path,
						workspaceTitle: typeof tavern.title === "string" ? tavern.title : tavern.path
					});
				}
				const changed = JSON.stringify(taverns) !== JSON.stringify(state.taverns);
				state = {
					...state,
					taverns,
					loaded: true
				};
				if (changed) notify$1();
			}).catch(() => {
				state = {
					...state,
					loaded: true
				};
				notify$1();
			}).finally(() => {
				fetching = false;
			});
		}
		/**
		* Match a session working directory to a registered tavern workspace.
		*
		* The match is exact (D004): only a session whose cwd is the tavern directory
		* itself is a tavern session. The host applies the same rule when it decides
		* whether to intercept a request, so the toolbox never offers tools for a
		* session the host would not orchestrate.
		* @param cwd - session working directory.
		* @param taverns - registered tavern workspaces.
		* @returns the tavern whose directory is the cwd, or `null`.
		*/
		function matchTavernWorkspace(cwd, taverns) {
			if (cwd === void 0 || cwd.length === 0) return null;
			const normalized = normalizeDirectory(cwd);
			for (const tavern of taverns) if (normalized === normalizeDirectory(tavern.workspacePath)) return tavern;
			return null;
		}
		/** Normalise a directory for comparison (separators, trailing slash, case). */
		function normalizeDirectory(directory) {
			return directory.replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
		}
		/**
		* Keep the launcher fully inside the viewport.
		* @param position - wanted top-left corner.
		* @param width - viewport width.
		* @param height - viewport height.
		* @returns a clamped position.
		*/
		function clampFabPosition(position, width, height) {
			const maxLeft = Math.max(FAB_MARGIN, width - 44 - FAB_MARGIN);
			const maxTop = Math.max(FAB_MARGIN, height - 44 - FAB_MARGIN);
			return {
				left: Math.min(Math.max(FAB_MARGIN, position.left), maxLeft),
				top: Math.min(Math.max(FAB_MARGIN, position.top), maxTop)
			};
		}
		/**
		* Default launcher seat: the left gutter, above the composer.
		* @param width - viewport width.
		* @param height - viewport height.
		* @returns a clamped position that clears the composer.
		*/
		function defaultFabPosition(width, height) {
			return clampFabPosition({
				left: FAB_MARGIN,
				top: height - 190
			}, width, height);
		}
		/** Read the remembered launcher position, falling back to the default seat. */
		function loadFabPosition() {
			if (typeof window === "undefined") return defaultFabPosition(1280, 800);
			try {
				const raw = window.localStorage.getItem(FAB_POSITION_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed.left === "number" && typeof parsed.top === "number" && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) return clampFabPosition({
						left: parsed.left,
						top: parsed.top
					}, window.innerWidth, window.innerHeight);
				}
			} catch {}
			return defaultFabPosition(window.innerWidth, window.innerHeight);
		}
		/** Remember the launcher position for the next page load. */
		function saveFabPosition(position) {
			if (typeof window === "undefined") return;
			try {
				window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position));
			} catch {}
		}
		/** Publish the station whose detector is mounted. */
		function publishStation(station) {
			const current = state.station;
			if (current === station || current !== null && station !== null && current.sessionId === station.sessionId && current.workspaceId === station.workspaceId) return;
			state = {
				...state,
				station,
				...station === null ? {
					open: false,
					activeTool: null
				} : {}
			};
			notify$1();
		}
		/** Open or close the icon popover. */
		function setToolboxOpen(open) {
			if (state.open === open) return;
			state = {
				...state,
				open
			};
			notify$1();
		}
		/** Open one tool sub-window, or close it with `null`. */
		function setActiveTool(tool) {
			if (state.activeTool === tool) return;
			state = {
				...state,
				activeTool: tool,
				open: false
			};
			notify$1();
		}
		/** Read the current store snapshot (tests and the surfaces). */
		function readToolboxState() {
			return state;
		}
		/**
		* Subscribe to store changes, including the tavern workspace list.
		* @param listener - called after every state change.
		* @returns the unsubscribe function.
		*/
		function subscribeToolboxState(listener) {
			return subscribe(listener);
		}
		/**
		* Invisible composer row: publishes the current session's tavern station so
		* the floating launcher can appear only in tavern sessions.
		* @param props - session id and the session-list selector hook.
		* @returns `null` (the row renders nothing).
		*/
		function TavernToolboxDetector(props) {
			const toolbox = (0, react.useSyncExternalStore)(subscribe, snapshot, snapshot);
			const cwd = props.useSessions((list) => list.byId[props.sessionId])?.cwd;
			(0, react.useEffect)(() => {
				ensureTaverns();
				const timer = window.setInterval(() => {
					ensureTaverns(true);
				}, 15e3);
				return () => window.clearInterval(timer);
			}, []);
			(0, react.useEffect)(() => {
				const match = matchTavernWorkspace(cwd, toolbox.taverns);
				if (match === null) {
					publishStation(null);
					return;
				}
				publishStation({
					sessionId: props.sessionId,
					workspaceId: match.workspaceId,
					workspacePath: match.workspacePath,
					workspaceTitle: match.workspaceTitle
				});
				return () => publishStation(null);
			}, [
				cwd,
				props.sessionId,
				toolbox.taverns
			]);
			(0, react.useEffect)(() => {
				const root = document.body;
				if (toolbox.station !== null && toolbox.station.sessionId === props.sessionId) root.dataset.dshtavernStory = "true";
				else delete root.dataset.dshtavernStory;
				return () => {
					delete root.dataset.dshtavernStory;
				};
			}, [toolbox.station, props.sessionId]);
			(0, react.useEffect)(() => {
				const id = "dshtavern-story-style";
				if (document.getElementById(id) !== null) return;
				const style = document.createElement("style");
				style.id = id;
				style.textContent = STORY_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, []);
			(0, react.useEffect)(() => {
				const stop = installTrackedTurnMarks(props.sessionId);
				return () => {
					stop();
				};
			}, [props.sessionId]);
			(0, react.useEffect)(() => {
				const station = toolbox.station;
				if (station === null) return;
				refreshTrackedTurns(station.workspaceId, props.sessionId);
				const timer = window.setInterval(() => {
					refreshTrackedTurns(station.workspaceId, props.sessionId);
				}, 3e4);
				return () => window.clearInterval(timer);
			}, [toolbox.station, props.sessionId]);
			(0, react.useEffect)(() => {
				if (toolbox.station === null) return;
				const stop = installReplyTargets(props.inputActions);
				return () => {
					stop();
				};
			}, [toolbox.station, props.inputActions]);
			return null;
		}
		const TOOLS = [
			{
				id: "prompt",
				glyph: "编",
				label: "提示词编排",
				enabled: true
			},
			{
				id: "agent",
				glyph: "演",
				label: "Agent 编排",
				enabled: true
			},
			{
				id: "characters",
				glyph: "卡",
				label: "角色卡",
				enabled: true
			},
			{
				id: "worldbooks",
				glyph: "书",
				label: "世界书",
				enabled: true
			},
			{
				id: "usage",
				glyph: "量",
				label: "用量统计",
				enabled: true
			},
			{
				id: "tracker",
				glyph: "追",
				label: "剧情回顾",
				enabled: true
			},
			{
				id: "persona",
				glyph: "我",
				label: "玩家人设",
				enabled: true
			}
		];
		/** Launcher glyph: a toolbox outline, drawn as artwork. */
		function LauncherIcon() {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": 2,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				"aria-hidden": true
			}, (0, react.createElement)("rect", {
				x: 3.5,
				y: 9,
				width: 17,
				height: 9.5,
				rx: 2.2
			}), (0, react.createElement)("path", { d: "M9 9V7.2A1.2 1.2 0 0 1 10.2 6h3.6A1.2 1.2 0 0 1 15 7.2V9" }), (0, react.createElement)("path", { d: "M3.5 13h17" }), (0, react.createElement)("path", { d: "M10.2 13v1.8h3.6V13" }));
		}
		/** Height of one popover tile, matching the CSS tile height. */
		const TOOL_TILE_HEIGHT = 64;
		const TOOL_POPOVER_GAP = 6;
		/**
		* Popover size for the registered tool count.
		*
		* The anchor math needs the real box, and the tile count is what the grid
		* wraps on, so both derive from {@link TOOLS} instead of a hardcoded box that
		* goes stale whenever a tool is added.
		* @returns the popover's width and height in CSS pixels.
		*/
		function toolPopoverSize() {
			const rows = Math.ceil(TOOLS.length / 2);
			return {
				width: 182,
				height: rows * TOOL_TILE_HEIGHT + (rows - 1) * TOOL_POPOVER_GAP + 20
			};
		}
		/** Icon popover anchored to the launcher. */
		function ToolboxPopover(position) {
			if (!state.open || state.station === null) return null;
			const { width, height } = toolPopoverSize();
			const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
			const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
			const left = Math.min(Math.max(8, position.left + 22 - width / 2), viewportWidth - width - 8);
			let top = position.top - height - 10;
			if (top < 8) top = Math.min(position.top + 44 + 10, viewportHeight - height - 8);
			return (0, react.createElement)("div", {
				className: "dshtavern-tool-popover",
				role: "toolbar",
				"aria-label": "酒馆工具箱",
				style: {
					left,
					top
				}
			}, TOOLS.map((tool) => (0, react.createElement)("button", {
				key: tool.id,
				type: "button",
				className: "dshtavern-tool-launch",
				title: tool.enabled ? tool.label : `${tool.label}（待实现）`,
				"aria-label": tool.label,
				disabled: !tool.enabled,
				onClick: () => setActiveTool(tool.id)
			}, (0, react.createElement)("span", {
				className: "dshtavern-tool-launch-glyph",
				"aria-hidden": true
			}, tool.glyph), (0, react.createElement)("span", { className: "dshtavern-tool-launch-label" }, tool.label))));
		}
		/** Tool sub-window. */
		function ToolWindow() {
			const station = state.station;
			const tool = state.activeTool;
			if (station === null || tool === null) return null;
			const entry = TOOLS.find((item) => item.id === tool);
			return (0, react.createElement)("div", {
				className: "dshtavern-panel dshtavern-window-layer",
				onClick: (event) => {
					if (event.target === event.currentTarget) setActiveTool(null);
				}
			}, (0, react.createElement)("section", {
				className: "dshtavern-window",
				role: "dialog",
				"aria-label": entry?.label ?? tool
			}, (0, react.createElement)("header", { className: "dshtavern-window-head" }, (0, react.createElement)("span", {
				className: "dshtavern-window-glyph",
				"aria-hidden": true
			}, entry?.glyph ?? "工"), (0, react.createElement)("div", { style: {
				flex: 1,
				minWidth: 0
			} }, (0, react.createElement)("div", { className: "dshtavern-window-title" }, `${entry?.label ?? tool} · ${station.workspaceTitle}`), (0, react.createElement)("div", {
				className: "dshtavern-window-sub",
				title: station.workspacePath
			}, station.workspacePath)), (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-window-close",
				title: "关闭",
				"aria-label": "关闭",
				onClick: () => setActiveTool(null)
			}, "✕")), (0, react.createElement)("div", { className: "dshtavern-window-body" }, tool === "prompt" ? (0, react.createElement)(PromptOrchestration, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath,
				sessionId: station.sessionId
			}) : tool === "agent" ? (0, react.createElement)(AgentPanel, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath
			}) : tool === "characters" ? (0, react.createElement)(CharacterCardTool, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath
			}) : tool === "worldbooks" ? (0, react.createElement)(WorldbookWorkbench, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath
			}) : tool === "persona" ? (0, react.createElement)(PersonaWorkbench, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath
			}) : tool === "usage" ? (0, react.createElement)(UsagePanel, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath,
				sessionId: station.sessionId
			}) : tool === "tracker" ? (0, react.createElement)(TrackerPanel, {
				workspaceId: station.workspaceId,
				workspaceTitle: station.workspaceTitle,
				workspacePath: station.workspacePath,
				sessionId: station.sessionId
			}) : (0, react.createElement)("div", { style: { padding: 20 } }, "该工具尚未实现。"))));
		}
		/**
		* Whether a launcher gesture counts as a drag.
		*
		* Sticky on purpose: once a gesture has crossed the threshold it stays a drag
		* even if the pointer returns to its origin, otherwise releasing where the
		* press started would produce a click and open the popover mid-drag.
		* @param moved - whether this gesture already crossed the threshold.
		* @param startX - press position, viewport pixels.
		* @param startY - press position, viewport pixels.
		* @param clientX - current pointer position.
		* @param clientY - current pointer position.
		* @returns whether the gesture is a drag.
		*/
		function launcherGestureMoved(moved, startX, startY, clientX, clientY) {
			return moved || Math.hypot(clientX - startX, clientY - startY) >= 4;
		}
		/**
		* Frame-wide toolbox: the draggable launcher, its icon popover, and the tool
		* sub-window. Renders nothing outside tavern sessions.
		* @returns the overlay elements, or `null`.
		*/
		function TavernToolboxOverlay() {
			const toolbox = (0, react.useSyncExternalStore)(subscribe, snapshot, snapshot);
			const [position, setPosition] = (0, react.useState)(() => loadFabPosition());
			const drag = (0, react.useRef)(null);
			const [dragging, setDragging] = (0, react.useState)(false);
			/**
			* Whether the gesture that just ended moved the launcher.
			*
			* Cleared at pointerdown, not only in the click handler: a gesture whose
			* pointerup lands outside the button produces no click, and a flag left set
			* would swallow the next real click.
			*/
			const dragged = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				const onResize = () => {
					setPosition((current) => clampFabPosition(current, window.innerWidth, window.innerHeight));
				};
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, []);
			(0, react.useEffect)(() => {
				if (!toolbox.open && toolbox.activeTool === null) return;
				const onKey = (event) => {
					if (event.key !== "Escape") return;
					if (state.activeTool !== null) setActiveTool(null);
					else setToolboxOpen(false);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [toolbox.open, toolbox.activeTool]);
			if (toolbox.station === null) return null;
			const onPointerDown = (event) => {
				dragged.current = false;
				drag.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					originLeft: position.left,
					originTop: position.top,
					moved: false,
					capture: null,
					latest: {
						left: position.left,
						top: position.top
					}
				};
				setDragging(true);
			};
			const onPointerMove = (event) => {
				const current = drag.current;
				if (current === null) return;
				const dx = event.clientX - current.startX;
				const dy = event.clientY - current.startY;
				if (!current.moved) {
					if (!launcherGestureMoved(false, current.startX, current.startY, event.clientX, event.clientY)) return;
					current.moved = true;
					dragged.current = true;
					try {
						event.currentTarget.setPointerCapture?.(event.pointerId);
						current.capture = event.currentTarget;
					} catch {}
				}
				const next = clampFabPosition({
					left: current.originLeft + dx,
					top: current.originTop + dy
				}, window.innerWidth, window.innerHeight);
				current.latest = next;
				setPosition(next);
			};
			const onPointerUp = () => {
				const current = drag.current;
				drag.current = null;
				setDragging(false);
				if (current === null) return;
				if (current.capture?.releasePointerCapture !== void 0) try {
					current.capture.releasePointerCapture(current.pointerId);
				} catch {}
				if (!current.moved) return;
				saveFabPosition(current.latest);
			};
			return (0, react.createElement)("div", null, (0, react.createElement)("style", { key: "dshtavern-toolbox-style" }, PANEL_CSS + TOOLBOX_CSS), toolbox.open ? (0, react.createElement)("div", {
				className: "dshtavern-fab-backdrop",
				onClick: () => setToolboxOpen(false)
			}) : null, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-fab",
				title: "酒馆工具箱（可拖动）",
				"aria-label": "酒馆工具箱",
				"aria-expanded": toolbox.open,
				"data-dragging": dragging,
				"data-open": toolbox.open,
				style: {
					left: position.left,
					top: position.top
				},
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel: onPointerUp,
				onClick: () => {
					if (dragged.current) {
						dragged.current = false;
						return;
					}
					setToolboxOpen(!state.open);
				}
			}, LauncherIcon()), ToolboxPopover(position), ToolWindow());
		}
		//#endregion
		//#region src/client/marks.ts
		/**
		* Tavern marks in the sidebar workspace list.
		*
		* The DSH sidebar exposes slots for session rows but none for a workspace row,
		* so a workspace cannot register its own decoration. This module reads the rows
		* the sidebar renders (`[data-row-key="workspace:<id>"]`) and, for the ids the
		* tavern registry reports, sets one attribute the stylesheet turns into a
		* badge. Nothing is moved, wrapped, or injected: a React re-render keeps the
		* attribute and re-marks on the next mutation.
		*/
		/** Attribute set on a workspace row that belongs to a tavern. */
		const TAVERN_ROW_ATTRIBUTE = "data-dshtavern-workspace";
		/** Stylesheet element id, so a second install cannot duplicate the rules. */
		const STYLE_ID = "dshtavern-sidebar-marks";
		/** Prefix the sidebar puts before a workspace id in `data-row-key`. */
		const ROW_KEY_PREFIX = "workspace:";
		/** Rules that render the badge. */
		const SIDEBAR_CSS = `
[${TAVERN_ROW_ATTRIBUTE}='true'] > :first-child {
  color: var(--tv-accent, var(--dsw-alias-state-business-primary, #4f7fe0));
}
[${TAVERN_ROW_ATTRIBUTE}='true'] > :nth-child(3) > span::after {
  content: '酒';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  margin-inline-start: 6px;
  border: var(--tv-hairline, 0.5px) solid color-mix(in srgb, var(--tv-accent, #4f7fe0) 45%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--tv-accent, #4f7fe0) 14%, transparent);
  color: var(--tv-accent, #4f7fe0);
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
  vertical-align: 1px;
  flex: none;
}
`;
		let tavernIds = /* @__PURE__ */ new Set();
		/**
		* Read the workspace id out of a sidebar row key.
		* @param rowKey - the row's `data-row-key`, e.g. `workspace:<uuid>`.
		* @returns the workspace id, or `undefined` for the ungrouped bucket and other rows.
		*/
		function tavernWorkspaceIdOf(rowKey) {
			if (rowKey === null || !rowKey.startsWith(ROW_KEY_PREFIX)) return void 0;
			const id = rowKey.slice(10);
			return id.length > 0 ? id : void 0;
		}
		/**
		* Apply the mark to one row.
		* @param row - the workspace row.
		* @param ids - tavern workspace ids.
		* @returns whether the row was marked.
		*/
		function applyMark(row, ids) {
			const id = tavernWorkspaceIdOf(row.rowKey);
			if (id !== void 0 && ids.has(id)) {
				row.setAttribute(TAVERN_ROW_ATTRIBUTE, "true");
				return true;
			}
			row.removeAttribute(TAVERN_ROW_ATTRIBUTE);
			return false;
		}
		/**
		* Apply the attribute to every workspace row currently in the document.
		*
		* Rows are matched by id, not by title: renaming a tavern workspace must not
		* move the mark to a different row.
		*/
		function markWorkspaceRows() {
			if (typeof document === "undefined") return;
			for (const row of document.querySelectorAll(`[data-row-key^="${ROW_KEY_PREFIX}"]`)) applyMark({
				rowKey: row.getAttribute("data-row-key"),
				setAttribute: (name, value) => row.setAttribute(name, value),
				removeAttribute: (name) => row.removeAttribute(name)
			}, tavernIds);
		}
		/**
		* Adopt the tavern ids the toolbox store currently holds.
		* @param ids - workspace ids reported by `/tavern/state`.
		*/
		function setTavernWorkspaceIds(ids) {
			const next = new Set(ids);
			if (next.size === tavernIds.size && [...next].every((id) => tavernIds.has(id))) return;
			tavernIds = next;
			markWorkspaceRows();
		}
		/**
		* Keep the sidebar marks in sync with the tavern registry.
		*
		* The observer watches child and attribute changes so a sidebar re-render
		* (expanding a workspace, renaming, switching views) re-marks rows without the
		* plugin tracking the sidebar's internal state.
		* @returns a disposer that stops observing and removes the stylesheet.
		*/
		function installTavernWorkspaceMarks() {
			if (typeof document === "undefined") return () => void 0;
			if (document.getElementById(STYLE_ID) === null) {
				const style = document.createElement("style");
				style.id = STYLE_ID;
				style.textContent = SIDEBAR_CSS + PANEL_CSS;
				document.head.appendChild(style);
			}
			ensureTaverns();
			const applyStore = () => {
				setTavernWorkspaceIds(readToolboxState().taverns.map((tavern) => tavern.workspaceId));
			};
			applyStore();
			const unsubscribe = subscribeToolboxState(applyStore);
			const observer = new MutationObserver(() => {
				markWorkspaceRows();
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["data-row-key"]
			});
			markWorkspaceRows();
			return () => {
				observer.disconnect();
				unsubscribe();
				tavernIds = /* @__PURE__ */ new Set();
				markWorkspaceRows();
				document.getElementById(STYLE_ID)?.remove();
			};
		}
		//#endregion
		//#region src/client/greeting.ts
		/**
		* Pre-chat opening line.
		*
		* A fresh tavern session has an empty transcript, and the first beat only runs
		* after the player speaks. Without this card the card's `greetings.first` would
		* never be seen: the author writes an opening scene, and the player opens to a
		* blank page.
		*
		* The card renders above the composer while the session is still blank. Once the
		* player speaks, the orchestrator stages the same line as history and this card
		* disappears with the blank state.
		*/
		/**
		* Read the opening for one story.
		*
		* With a session the host generates (once, cached on disk) a full opening
		* script; without one it only reports the static card fields, used as the
		* fallback when no script could be written.
		* @param workspaceId - registered tavern workspace id.
		* @param sessionId - chat identity, so the script belongs to this chat.
		* @returns what the card should render, or `undefined` when there is nothing.
		*/
		async function fetchOpening(workspaceId, sessionId) {
			const params = new URLSearchParams({ workspaceId });
			if (sessionId !== void 0 && sessionId.length > 0) params.set("sessionId", sessionId);
			const body = await (await fetch(`/tavern/greeting?${params.toString()}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			})).json();
			if (body.ok !== true) return void 0;
			const rawSegments = Array.isArray(body.script?.segments) ? body.script.segments : [];
			const segments = [];
			for (const item of rawSegments) {
				if (typeof item !== "object" || item === null) continue;
				const record = item;
				const kind = record.kind === "speech" ? "speech" : record.kind === "narration" ? "narration" : void 0;
				const text = typeof record.text === "string" ? record.text : "";
				if (kind === void 0 || text.trim().length === 0) continue;
				segments.push({
					kind,
					text,
					...typeof record.cardId === "string" ? { cardId: record.cardId } : {},
					...typeof record.speakerName === "string" ? { speakerName: record.speakerName } : {}
				});
			}
			if (segments.length > 0) return {
				kind: "script",
				segments
			};
			const narration = typeof body.narration?.text === "string" && body.narration.text.trim().length > 0 ? {
				cardId: String(body.narration.cardId ?? ""),
				text: body.narration.text
			} : void 0;
			const greeting = typeof body.greeting?.text === "string" && typeof body.greeting.name === "string" && body.greeting.text.trim().length > 0 ? {
				cardId: String(body.greeting.cardId ?? ""),
				name: body.greeting.name,
				text: body.greeting.text
			} : void 0;
			if (narration === void 0 && greeting === void 0) return void 0;
			return {
				kind: "static",
				...narration === void 0 ? {} : { narration },
				...greeting === void 0 ? {} : { greeting }
			};
		}
		/**
		* Ask the host to run the opening as a real turn.
		*
		* Transcript order is turn order, and only the agent loop can open a turn, so
		* the card cannot insert the opening itself. Queuing it as a trigger turn is
		* what makes the opening appear above the player's first message; the card
		* stays visible until that turn lands.
		* @param workspaceId - registered tavern workspace id.
		* @param sessionId - chat identity.
		* @returns whether a turn was queued.
		*/
		async function requestOpeningTurn(workspaceId, sessionId) {
			const body = await (await fetch("/tavern/opening", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({
					workspaceId,
					sessionId
				})
			})).json();
			return body.ok === true && body.queued === true;
		}
		/**
		* Show the scene and first line above the composer while the chat is blank.
		* @param props - session identity and blank flag.
		* @returns the card, or `null` when it does not apply.
		*/
		function TavernGreetingDock(props) {
			const cwd = props.useSessions((list) => list.byId[props.session.sessionId])?.cwd;
			const [opening, setOpening] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [station, setStation] = (0, react.useState)(null);
			const syncStation = (0, react.useCallback)(() => {
				const match = matchTavernWorkspace(cwd, readToolboxState().taverns);
				setStation(match === null ? null : { workspaceId: match.workspaceId });
			}, [cwd]);
			(0, react.useEffect)(() => {
				ensureTaverns();
				syncStation();
				return subscribeToolboxState(syncStation);
			}, [syncStation]);
			(0, react.useEffect)(() => {
				if (station === null) {
					setOpening(null);
					setLoading(false);
					return;
				}
				let cancelled = false;
				setLoading(true);
				fetchOpening(station.workspaceId, props.session.sessionId).then(async (next) => {
					if (cancelled) return;
					setOpening(next ?? null);
					if (next !== void 0) await requestOpeningTurn(station.workspaceId, props.session.sessionId).catch(() => false);
					if (cancelled) return;
					setLoading(false);
				}).catch(() => {
					if (cancelled) return;
					setOpening(null);
					setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [station, props.session.sessionId]);
			if (!props.session.blank) return null;
			if (loading) return (0, react.createElement)("section", {
				className: "dshtavern-greeting dshtavern-greeting-loading",
				"aria-label": "正在生成开场",
				"aria-busy": true
			}, (0, react.createElement)("div", {
				className: "dshtavern-opening-spinner",
				"aria-hidden": true
			}), (0, react.createElement)("div", { className: "dshtavern-opening-loading-text" }, (0, react.createElement)("div", { className: "dshtavern-opening-loading-title" }, "正在生成开场…"), (0, react.createElement)("div", { className: "dshtavern-opening-loading-hint" }, "首次进入需要一次模型调用，通常十几秒。生成后会存进本会话，之后打开不再重复生成。")));
			if (opening === null) return null;
			if (opening.kind === "script") return (0, react.createElement)("section", {
				className: "dshtavern-greeting",
				"aria-label": "开场"
			}, opening.segments.map((segment, index) => {
				if (segment.kind === "narration") return (0, react.createElement)("p", {
					key: index,
					className: "dshtavern-opening-narration"
				}, segment.text);
				const previous = opening.segments[index - 1];
				const continued = previous?.kind === "speech" && previous.cardId === segment.cardId;
				return (0, react.createElement)("div", {
					key: index,
					className: "dshtavern-opening-speech",
					"data-continued": continued ? "true" : "false"
				}, (0, react.createElement)("div", { className: "dshtavern-greeting-head" }, continued ? null : (0, react.createElement)("span", {
					className: "dshtavern-greeting-avatar",
					"aria-hidden": true
				}, (segment.speakerName ?? "?").slice(0, 1)), (0, react.createElement)("div", { className: "dshtavern-greeting-title" }, (0, react.createElement)("span", { className: "dshtavern-greeting-name" }, continued ? "（继续）" : segment.speakerName ?? "角色"))), (0, react.createElement)("p", { className: "dshtavern-greeting-text" }, segment.text));
			}), (0, react.createElement)("div", { className: "dshtavern-opening-foot" }, "回应即可开始"));
			return (0, react.createElement)("section", {
				className: "dshtavern-greeting",
				"aria-label": "开场"
			}, opening.narration === void 0 ? null : (0, react.createElement)("p", { className: "dshtavern-opening-narration" }, opening.narration.text), opening.greeting === void 0 ? null : (0, react.createElement)("div", { className: "dshtavern-opening-speech" }, (0, react.createElement)("div", { className: "dshtavern-greeting-head" }, (0, react.createElement)("span", {
				className: "dshtavern-greeting-avatar",
				"aria-hidden": true
			}, opening.greeting.name.slice(0, 1)), (0, react.createElement)("div", { className: "dshtavern-greeting-title" }, (0, react.createElement)("span", { className: "dshtavern-greeting-name" }, opening.greeting.name), (0, react.createElement)("span", { className: "dshtavern-greeting-hint" }, "开场白 · 回应即可开始"))), (0, react.createElement)("p", { className: "dshtavern-greeting-text" }, opening.greeting.text)));
		}
		//#endregion
		//#region src/client/regenerate.ts
		/**
		* Regeneration controls under a tavern reply.
		*
		* DSH's transcript is append-only, so "regenerate" cannot rewrite the reply in
		* place. The Host rewinds the story state to the start of the newest beat,
		* replays it, and appends the replacement as the next turn; this strip is how
		* the player asks for that, and how the superseded reply is labelled after.
		*
		* The action only ever appears under the newest closed turn, because the
		* rewind target is the newest beat. Anything older would have to discard every
		* turn after it.
		*/
		/** Superseded turns per session: the turn number mapped to its replacement. */
		const superseded = /* @__PURE__ */ new Map();
		/** Newest turn the Host can replay, per session; absent while unknown. */
		const replayable = /* @__PURE__ */ new Map();
		/** In-flight list reads, so several mounted strips share one request. */
		const refreshing = /* @__PURE__ */ new Map();
		/** Sessions whose strip asked again while a read was in flight. */
		const rerun = /* @__PURE__ */ new Set();
		const listeners = /* @__PURE__ */ new Set();
		/** Stable empty value, so a session without records keeps one snapshot identity. */
		const EMPTY = /* @__PURE__ */ new Map();
		function notify() {
			for (const listener of listeners) listener();
		}
		/**
		* Subscribe to the superseded-turn cache.
		* @param listener - called after any session's records change.
		* @returns the unsubscribe function.
		*/
		function subscribeRegenerations(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/**
		* Read one session's superseded turns.
		* @param sessionId - chat identity.
		* @returns turn number to replacement turn number; a stable empty map before the first read.
		*/
		function regenerationSnapshot(sessionId) {
			return superseded.get(sessionId) ?? EMPTY;
		}
		/**
		* Read the newest turn the Host can replay.
		* @param sessionId - chat identity.
		* @returns that turn, or `undefined` when the story has nothing to replay.
		*/
		function replayableTurn(sessionId) {
			return replayable.get(sessionId);
		}
		/** Replace one session's cache entry without changing identity when nothing moved. */
		function store(sessionId, records, turn) {
			const next = /* @__PURE__ */ new Map();
			for (const record of records) next.set(record.turn, record.replacement);
			const previous = superseded.get(sessionId) ?? EMPTY;
			const sameRecords = next.size === previous.size && [...next].every(([oldTurn, replacement]) => previous.get(oldTurn) === replacement);
			const sameTurn = replayable.get(sessionId) === turn;
			if (sameRecords && sameTurn) return;
			superseded.set(sessionId, next);
			if (turn === void 0) replayable.delete(sessionId);
			else replayable.set(sessionId, turn);
			notify();
		}
		/**
		* Follow a replacement chain to the reply that currently stands.
		*
		* Regenerating a regeneration adds another hop (2→3, then 3→4). The marker
		* under turn 2 must name the reply the player can actually read, not the
		* intermediate draft that was itself replaced.
		* @param records - superseded turns for the session.
		* @param turn - the turn whose marker is being rendered.
		* @returns the newest replacement turn, or `undefined` when the turn stands.
		*/
		function finalReplacement(records, turn) {
			let current = records.get(turn);
			if (current === void 0) return void 0;
			const visited = /* @__PURE__ */ new Set([turn]);
			while (!visited.has(current)) {
				visited.add(current);
				const next = records.get(current);
				if (next === void 0) break;
				current = next;
			}
			return current;
		}
		/**
		* Fetch one session's superseded turns.
		*
		* `force` exists because the list grows at the end of a regeneration: a cache
		* filled before that write would keep the replaced reply looking current.
		* @param workspaceId - registered tavern workspace id.
		* @param sessionId - chat identity.
		* @param force - re-read even when a cached list exists.
		*/
		function ensureRegenerations(workspaceId, sessionId, force = false) {
			if (!force && superseded.has(sessionId)) return;
			if (refreshing.has(sessionId)) {
				rerun.add(sessionId);
				return;
			}
			const task = fetch(`/tavern/regenerate?${new URLSearchParams({
				workspaceId,
				sessionId
			}).toString()}`, {
				headers: { accept: "application/json" },
				cache: "no-store"
			}).then(async (response) => {
				const body = await response.json();
				if (body.ok !== true) return;
				const records = [];
				for (const item of Array.isArray(body.regenerations) ? body.regenerations : []) {
					if (typeof item !== "object" || item === null) continue;
					const record = item;
					if (typeof record.turn !== "number" || typeof record.replacement !== "number") continue;
					records.push({
						turn: record.turn,
						replacement: record.replacement
					});
				}
				store(sessionId, records, typeof body.replayableTurn === "number" ? body.replayableTurn : void 0);
			}).catch(() => {});
			refreshing.set(sessionId, task);
			task.finally(() => {
				refreshing.delete(sessionId);
				if (rerun.delete(sessionId)) ensureRegenerations(workspaceId, sessionId, true);
			});
		}
		/**
		* Render the regenerate action and the superseded marker.
		* @param props - owning turn, session identity, and the standard hooks.
		* @returns an action row, or `null` outside a tavern or under a stale turn.
		*/
		function TavernTurnActions(props) {
			const cwd = props.useSessions((list) => list.byId[props.sessionId]?.cwd);
			const newestTurn = props.useChat((snapshot) => {
				const order = snapshot.timeline?.turnOrder;
				return order === void 0 || order.length === 0 ? void 0 : order[order.length - 1];
			});
			const records = (0, react.useSyncExternalStore)(subscribeRegenerations, () => regenerationSnapshot(props.sessionId), () => regenerationSnapshot(props.sessionId));
			const [station, setStation] = (0, react.useState)(null);
			const [state, setState] = (0, react.useState)({
				busy: false,
				error: null
			});
			const syncStation = (0, react.useCallback)(() => {
				const match = matchTavernWorkspace(cwd, readToolboxState().taverns);
				setStation(match === null ? null : { workspaceId: match.workspaceId });
			}, [cwd]);
			(0, react.useEffect)(() => {
				ensureTaverns();
				syncStation();
				return subscribeToolboxState(syncStation);
			}, [syncStation]);
			(0, react.useEffect)(() => {
				if (station === null) return;
				ensureRegenerations(station.workspaceId, props.sessionId, true);
			}, [
				station,
				props.sessionId,
				newestTurn
			]);
			const replacement = finalReplacement(records, props.turn.turn);
			const newestReplayable = (0, react.useSyncExternalStore)(subscribeRegenerations, () => replayableTurn(props.sessionId), () => replayableTurn(props.sessionId));
			const start = (0, react.useCallback)(() => {
				if (station === null) return;
				setState({
					busy: true,
					error: null
				});
				fetch("/tavern/regenerate", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						accept: "application/json"
					},
					body: JSON.stringify({
						workspaceId: station.workspaceId,
						sessionId: props.sessionId,
						turn: props.turn.turn
					})
				}).then(async (response) => {
					const body = await response.json();
					if (body.ok === true) {
						setState({
							busy: false,
							error: null
						});
						return;
					}
					setState({
						busy: false,
						error: typeof body.error === "string" ? body.error : "重新生成失败"
					});
				}).catch((error) => {
					setState({
						busy: false,
						error: error instanceof Error ? error.message : String(error)
					});
				});
			}, [
				station,
				props.sessionId,
				props.turn.turn
			]);
			if (station === null) return null;
			if (replacement !== void 0) return (0, react.createElement)("div", { className: "dshtavern-regenerate-row" }, (0, react.createElement)("span", { className: "dshtavern-regenerate-superseded" }, `这一条已被第 ${replacement} 轮重新生成取代`));
			if (newestTurn !== props.turn.turn || props.turn.status !== "closed") return null;
			if (newestReplayable === void 0 || newestReplayable !== props.turn.turn) return null;
			return (0, react.createElement)("div", { className: "dshtavern-regenerate-row" }, (0, react.createElement)("button", {
				type: "button",
				className: "dshtavern-regenerate-action",
				onClick: start,
				disabled: state.busy,
				title: "回退到这一幕开始前的剧情状态，再让导演和角色重新演一次"
			}, state.busy ? "正在重新生成…" : "重新生成"), state.error === null ? null : (0, react.createElement)("span", { className: "dshtavern-regenerate-error" }, state.error));
		}
		/** Read a string field, or `undefined` when it is not a string. */
		function text(value) {
			return typeof value === "string" ? value : void 0;
		}
		/** Read a non-negative safe integer. */
		function index(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		/**
		* Parse one stored beat record.
		*
		* The payload comes back from disk, so every field is checked; a malformed
		* record is dropped rather than rendered as a half-empty row.
		* @param value - decoded JSON value.
		* @returns the record, or `undefined` when it cannot be trusted.
		*/
		function parseBeatLog(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const record = value;
			const at = text(record.at);
			if (at === void 0) return void 0;
			const rawCalls = Array.isArray(record.calls) ? record.calls : [];
			const calls = [];
			for (const item of rawCalls) {
				if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
				const call = item;
				if (call.role !== "opening" && call.role !== "director" && call.role !== "character") continue;
				const model = text(call.model);
				const system = text(call.system);
				const message = text(call.message);
				const reply = text(call.reply);
				if (model === void 0 || system === void 0 || message === void 0 || reply === void 0) continue;
				const cardId = text(call.cardId);
				const name = text(call.name);
				calls.push({
					role: call.role,
					model,
					system,
					message,
					reply,
					...cardId === void 0 ? {} : { cardId },
					...name === void 0 ? {} : { name },
					...call.truncated === true ? { truncated: true } : {}
				});
			}
			if (calls.length === 0) return void 0;
			const turn = index(record.turn);
			const regeneratedFrom = text(record.regeneratedFrom);
			const inner = text(record.inner);
			return {
				at,
				playerInput: text(record.playerInput) ?? "",
				calls,
				...turn === void 0 ? {} : { turn },
				...regeneratedFrom === void 0 ? {} : { regeneratedFrom },
				...inner === void 0 ? {} : { inner },
				...record.truncated === true ? { truncated: true } : {}
			};
		}
		/**
		* One-line account of a beat, for the collapsed row.
		* @param log - stored beat record.
		* @returns a short label naming the turn and who spoke.
		*/
		function summarizeBeatLog(log) {
			const where = log.turn === void 0 ? "" : `第 ${log.turn} 轮 · `;
			if (log.calls.some((call) => call.role === "opening")) return `${where}开场脚本`;
			const speakers = log.calls.filter((call) => call.role === "character").map((call) => call.name ?? call.cardId ?? "角色");
			return `${where}导演 + ${speakers.length === 0 ? "无角色开口" : speakers.join("、")}`;
		}
		/**
		* Render one beat's prompts as a readable document.
		*
		* Order matters: the director decides what happens, so its calls are shown
		* first, then each character call in the order it ran.
		* @param log - stored beat record.
		* @returns Markdown-style text for the record's detail pane.
		*/
		function renderBeatLogText(log) {
			const sections = [
				`${summarizeBeatLog(log)}${log.regeneratedFrom === void 0 ? "" : "（重新生成）"}`,
				`时间：${log.at}`,
				`玩家输入：${log.playerInput.length === 0 ? "（无）" : log.playerInput}`
			];
			if (log.truncated === true) sections.push("（部分字段超过日志上限，已截断；完整内容见本幕的 beat 文件）");
			let step = 0;
			for (const call of log.calls) {
				step += 1;
				const title = call.role === "opening" ? `开场编剧 · 调用 ${step}` : call.role === "director" ? `导演 · 调用 ${step}` : `角色 · ${call.name ?? call.cardId ?? "未知"} · 调用 ${step}`;
				sections.push("", `## ${title}`, `模型：${call.model}`, ...call.truncated === true ? ["（本调用有字段被截断）"] : [], "", "### system", call.system, "", "### user", call.message, "", "### 回复", call.reply);
			}
			if (log.inner !== void 0 && log.inner.length > 0) sections.push("", "## 导演私记", log.inner);
			return sections.join("\n");
		}
		//#endregion
		//#region src/client/beat-record.ts
		/** Source kind the row reports as its producer. */
		const BEAT_SOURCE_KIND = "dshtavern-beat";
		/**
		* Read the plugin record out of one event.
		* @param event - any dispatched event.
		* @returns the parsed record, or `undefined` for every other event.
		*/
		function beatOf(event) {
			if (event.type !== "plugin:dshtavern/beat") return void 0;
			return parseBeatLog(event.data);
		}
		/** Trajectory Definition rendering one beat's logged prompts. */
		const tavernBeatDefinition = {
			kind: "dshtavern-beat",
			target: "trajectory",
			match: (event) => {
				if (event.type !== "plugin:dshtavern/beat") return null;
				return {
					id: String(event.seq),
					role: "start"
				};
			},
			start: (context, match) => {
				const beat = beatOf(match.event);
				if (beat === void 0) throw new Error("dshtavern-beat start requires a readable beat record");
				const summary = summarizeBeatLog(beat);
				return {
					summary,
					node: {
						kind: "context",
						seq: match.event.seq,
						time: match.event.time,
						content: [{
							type: "text",
							text: renderBeatLogText(beat)
						}],
						source: {
							kind: BEAT_SOURCE_KIND,
							form: "notice",
							summary
						},
						producer: {
							role: "inject",
							label: "DSH-Tavern"
						},
						form: "notice"
					}
				};
			},
			update: (context) => context.state,
			buildViewNode: (context) => {
				const state = context.state;
				if (state === void 0) return null;
				return {
					key: context.key,
					kind: context.kind,
					id: context.id,
					target: "trajectory",
					anchorSeq: state.node.seq,
					location: context.start?.location ?? { kind: "unresolved" },
					data: {
						kind: "node",
						node: state.node
					}
				};
			}
		};
		/**
		* Register the tavern beat record with the Conversation registry.
		*
		* `uiConversation` is injected rather than required: a profile without the
		* Trajectory/Conversation client halves still loads the rest of the tavern UI,
		* it just has no trajectory tab to contribute to.
		* @param ctx - browser plugin context.
		*/
		function installTavernBeatRecords(ctx) {
			ctx.inject(["uiConversation"], (scoped) => {
				const uiConversation = scoped.uiConversation;
				scoped.effect(() => uiConversation.events.register(tavernBeatDefinition), "dshtavern: trajectory beat records");
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* DSH-Tavern browser half: the tavern panel, sidebar entry, and toolbox seats.
		*
		* Registers the sidebar entry and the main panel. The panel lists registered
		* tavern workspaces, creates a new tavern (directory + marker + DSH workspace
		* registration) and can adopt an existing workspace; the Host half owns every
		* filesystem and registry mutation behind `/tavern/*` JSON routes.
		*
		* This bundle also registers the invisible composer detector and the frame
		* overlay that together draw the in-session toolbox.
		*
		* Typography and spacing scale through `--tv-scale`, raised by media queries so
		* 2K/4K viewports get larger text instead of the same 13px as a 1080p window.
		*/
		/** The id shared by the sidebar entry and the main panel it opens. */
		const PANEL_ID = "tavern";
		/** Required client services: the slot registry. */
		const inject = ["slots"];
		/** Human-facing label for one mode. */
		const MODE_LABELS = {
			rp: "角色扮演",
			novel: "小说模式"
		};
		/**
		* Component-scoped stylesheet. The whole page is one card: header, tavern list,
		* create and adopt forms live inside it, separated by dividers instead of
		* separate cards. Media queries raise the whole type scale on large screens.
		*/
		/** One action button. */
		function Button(props) {
			return (0, react.createElement)("button", {
				type: "button",
				className: props.className ?? CLASS.button,
				onClick: props.onClick,
				disabled: props.disabled === true
			}, props.label);
		}
		/** A section heading with an optional count. */
		function SectionTitle(props) {
			return (0, react.createElement)("div", { className: CLASS.sectionTitle }, (0, react.createElement)("span", null, props.text), props.count === void 0 ? null : (0, react.createElement)("span", { className: CLASS.count }, String(props.count)));
		}
		/** Format one ISO instant for display; keep the raw text when unparsable. */
		function formatInstant(value) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").slice(0, 16);
		}
		/** Card head: title, subtitle, last refresh, refresh control. */
		function CardHead(props) {
			return (0, react.createElement)("header", { className: CLASS.cardHead }, (0, react.createElement)("div", { className: CLASS.headMain }, (0, react.createElement)("div", { className: CLASS.title }, "酒馆"), (0, react.createElement)("div", { className: CLASS.subtitle }, "一个酒馆工作区 = 一个目录 + 一个酒馆标记；其中的聊天是 DSH 会话。")), (0, react.createElement)("div", { className: CLASS.headSide }, props.lastRefreshed === null ? null : (0, react.createElement)("span", { className: CLASS.meta }, `最近刷新 ${props.lastRefreshed}`), Button({
				label: props.loading ? "加载中…" : "刷新",
				className: props.loading ? CLASS.buttonPulse : void 0,
				onClick: props.onRefresh,
				disabled: props.loading || props.busy
			})));
		}
		/** Error and success banners, or `null` when there is nothing to show. */
		function CardBanners(props) {
			if (props.error === null && props.notice === null) return null;
			return (0, react.createElement)("div", { className: CLASS.banners }, props.error === null ? null : (0, react.createElement)("div", { className: CLASS.bannerError }, (0, react.createElement)("span", null, props.error), (0, react.createElement)("span", { className: CLASS.bannerAction }, Button({
				label: "重试",
				onClick: props.onRefresh,
				disabled: props.loading || props.busy
			}))), props.notice === null ? null : (0, react.createElement)("div", { className: CLASS.bannerNotice }, props.notice));
		}
		/** One tavern workspace row. */
		function TavernRow(tavern, index) {
			return (0, react.createElement)("div", {
				key: tavern.workspaceId,
				className: CLASS.row,
				style: { animationDelay: `${Math.min(index, 8) * 35}ms` }
			}, (0, react.createElement)("div", { className: CLASS.rowMain }, (0, react.createElement)("div", { className: CLASS.name }, tavern.title), (0, react.createElement)("div", {
				className: CLASS.path,
				title: tavern.path
			}, tavern.path), (0, react.createElement)("div", { className: CLASS.hint }, `tavernId ${tavern.marker.tavernId.slice(0, 8)} · ${MODE_LABELS[tavern.marker.mode ?? "rp"]} · 创建于 ${formatInstant(tavern.marker.createdAt)}`)));
		}
		/** The tavern workspace list pane. */
		function TavernListPane(props, taverns) {
			return (0, react.createElement)("section", { className: CLASS.pane }, SectionTitle({
				text: "酒馆工作区",
				count: taverns.length
			}), taverns.length === 0 ? (0, react.createElement)("div", { className: CLASS.hint }, "还没有酒馆工作区。在右侧新建表单里填一个名称就能创建。") : (0, react.createElement)("div", null, taverns.map((tavern, index) => TavernRow(tavern, index))));
		}
		/** Mode picker shared by creation and adoption. */
		function ModePicker(props) {
			return (0, react.createElement)("div", {
				className: "dshtavern-mode-picker",
				role: "radiogroup",
				"aria-label": "酒馆模式"
			}, ["rp", "novel"].map((mode) => (0, react.createElement)("button", {
				key: mode,
				type: "button",
				className: "dshtavern-mode-option",
				"data-active": props.draftMode === mode,
				role: "radio",
				"aria-checked": props.draftMode === mode,
				onClick: () => props.onModeChange(mode),
				disabled: props.busy
			}, (0, react.createElement)("span", { className: "dshtavern-mode-name" }, MODE_LABELS[mode]), (0, react.createElement)("span", { className: "dshtavern-mode-desc" }, mode === "rp" ? "以角色卡身份对话" : "叙述式写作（提示词块待实现）"))));
		}
		/** The create form, one group inside the right pane. */
		function CreateGroup(props, canCreate, defaultRoot) {
			const onKeyDown = (event) => {
				if (event.key === "Enter" && canCreate) props.onSubmitShortcut();
			};
			return (0, react.createElement)("section", { className: CLASS.group }, SectionTitle({ text: "新建酒馆" }), (0, react.createElement)("div", { className: CLASS.form }, (0, react.createElement)("div", { className: CLASS.field }, (0, react.createElement)("span", { className: CLASS.label }, "模式（创建后不可更改）"), ModePicker(props)), (0, react.createElement)("label", { className: CLASS.field }, (0, react.createElement)("span", { className: CLASS.label }, "名称"), (0, react.createElement)("input", {
				className: CLASS.input,
				value: props.draftTitle,
				placeholder: "例如：雾都夜话",
				onChange: (event) => props.onTitleChange(event.target.value),
				onKeyDown
			})), (0, react.createElement)("label", { className: CLASS.field }, (0, react.createElement)("span", { className: CLASS.label }, "目录（可选，默认自动创建）"), (0, react.createElement)("input", {
				className: CLASS.input,
				value: props.draftPath,
				placeholder: defaultRoot === "" ? "接受绝对路径，留空则自动创建" : `留空则创建到 ${defaultRoot}/<名称>`,
				onChange: (event) => props.onPathChange(event.target.value),
				onKeyDown
			})), (0, react.createElement)("div", { className: CLASS.hint }, "创建时会依次：创建目录 → 原子写入 .dshtavern/tavern.json → 注册为 DSH 工作区。"), (0, react.createElement)("div", { className: CLASS.formActions }, Button({
				label: props.busy ? "处理中…" : "创建酒馆",
				className: CLASS.buttonPrimary,
				onClick: props.onCreate,
				disabled: !canCreate
			}))));
		}
		/**
		* Render the panel body without hooks, so it stays unit-testable.
		* @param props - read model and action callbacks.
		* @returns the panel element tree.
		*/
		function PanelView(props) {
			const overview = props.overview;
			const taverns = overview?.taverns ?? [];
			const defaultRoot = overview?.defaultRoot ?? "";
			const canCreate = !props.busy && (props.draftTitle.trim().length > 0 || props.draftPath.trim().length > 0);
			return (0, react.createElement)("div", { className: CLASS.panel }, (0, react.createElement)("style", { key: "dshtavern-style" }, PANEL_CSS), (0, react.createElement)("article", { className: CLASS.card }, CardHead(props), CardBanners(props), (0, react.createElement)("div", { className: CLASS.cardBody }, TavernListPane(props, taverns), (0, react.createElement)("section", { className: CLASS.pane }, CreateGroup(props, canCreate, defaultRoot))), (0, react.createElement)("footer", { className: CLASS.cardFoot }, (0, react.createElement)("div", { className: CLASS.hint }, "标识文件只随目录走；删除工作区注册不会删除目录，重新添加同一目录时会自动恢复为酒馆。"))));
		}
		/** Read failure as display text. */
		function errorText(cause) {
			return cause instanceof Error ? cause.message : String(cause);
		}
		/** Parse one JSON response, reporting a missing route as an actionable message. */
		async function readJsonResponse(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(`酒馆接口不可用（HTTP ${response.status}）：插件可能尚未重新加载`);
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("酒馆接口返回了非对象 JSON");
			const record = body;
			if (record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : `酒馆请求失败（HTTP ${response.status}）`);
			return record;
		}
		/** Fetch the panel read model. */
		async function fetchOverview() {
			return await readJsonResponse(await fetch("/tavern/state", {
				headers: { accept: "application/json" },
				cache: "no-store"
			}));
		}
		/** POST one tavern action and return the raw success body. */
		async function postTavern(path, payload) {
			return await readJsonResponse(await fetch(path, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify(payload)
			}));
		}
		/** Current wall-clock label for the "recently refreshed" indicator. */
		function clockLabel() {
			return (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
		}
		/**
		* Stateful container: owns the read model, the form draft, and the request
		* lifecycle; renders {@link PanelView}.
		*
		* The read model refreshes on mount, every few seconds while the page is
		* visible, when the window regains focus, and after every successful action, so
		* a workspace created elsewhere no longer leaves the panel stale.
		* @returns the panel element tree.
		*/
		function TavernPanel() {
			const [overview, setOverview] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [draftTitle, setDraftTitle] = (0, react.useState)("");
			const [draftPath, setDraftPath] = (0, react.useState)("");
			const [draftMode, setDraftMode] = (0, react.useState)("rp");
			const [lastRefreshed, setLastRefreshed] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)(async (quiet = false) => {
				if (!quiet) setLoading(true);
				try {
					const next = await fetchOverview();
					setOverview(next);
					setError(null);
					setLastRefreshed(clockLabel());
				} catch (cause) {
					if (!quiet) setError(errorText(cause));
				} finally {
					setLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					if (document.visibilityState === "visible") refresh(true);
				}, 4e3);
				const onFocus = () => {
					refresh(true);
				};
				const onVisibility = () => {
					if (document.visibilityState === "visible") refresh(true);
				};
				window.addEventListener("focus", onFocus);
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					window.clearInterval(timer);
					window.removeEventListener("focus", onFocus);
					document.removeEventListener("visibilitychange", onVisibility);
				};
			}, [refresh]);
			const run = (0, react.useCallback)(async (operation) => {
				setBusy(true);
				setError(null);
				setNotice(null);
				try {
					const message = await operation();
					await refresh(true);
					setNotice(message);
				} catch (cause) {
					setError(errorText(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			const onCreate = (0, react.useCallback)(() => {
				if (draftTitle.trim().length === 0 && draftPath.trim().length === 0) return;
				run(async () => {
					const tavern = (await postTavern("/tavern/create", {
						title: draftTitle.trim(),
						path: draftPath.trim(),
						mode: draftMode
					})).tavern;
					setDraftTitle("");
					setDraftPath("");
					return `已创建${MODE_LABELS[draftMode]}酒馆工作区「${tavern?.title ?? draftTitle.trim()}」`;
				});
			}, [
				draftMode,
				draftPath,
				draftTitle,
				run
			]);
			return (0, react.createElement)(PanelView, {
				overview,
				loading,
				busy,
				error,
				notice,
				draftTitle,
				draftPath,
				draftMode,
				lastRefreshed,
				onTitleChange: setDraftTitle,
				onPathChange: setDraftPath,
				onModeChange: setDraftMode,
				onCreate,
				onRefresh: () => {
					refresh();
				},
				onSubmitShortcut: onCreate
			});
		}
		/** Sidebar glyph for the tavern entry. */
		function TavernIcon({ size, active }) {
			return (0, react.createElement)("span", {
				"aria-hidden": true,
				style: {
					boxSizing: "border-box",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: size,
					height: size,
					borderRadius: 8,
					fontSize: Math.round(size * .5),
					fontWeight: 600,
					color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
					background: active ? "var(--dsw-alias-bg-layer-2)" : "transparent"
				}
			}, "酒");
		}
		/**
		* Contribute the Tavern sidebar row and its main panel.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID
			}, TavernPanel));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 0,
				label: "酒馆"
			}, TavernIcon));
			const composerLeftSlot = "conversation.input.left";
			ctx.slots.inject(composerLeftSlot, () => ctx.slots.register({
				name: composerLeftSlot,
				id: "tavern-toolbox",
				order: -5,
				label: "酒馆工具箱"
			}, TavernToolboxDetector));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "tavern-toolbox-drawer",
				order: 20,
				label: "酒馆工具箱"
			}, TavernToolboxOverlay));
			const greetingDock = "conversation.input.dock";
			ctx.slots.inject(greetingDock, () => ctx.slots.register({
				name: greetingDock,
				id: "tavern-greeting",
				order: -10,
				label: "酒馆开场白"
			}, TavernGreetingDock));
			const turnTail = "conversation.chat.turnTail";
			ctx.slots.inject(turnTail, () => ctx.slots.register({
				name: turnTail,
				id: "tavern-regenerate",
				order: 0,
				label: "酒馆重新生成"
			}, TavernTurnActions));
			ctx.effect(() => installTavernWorkspaceMarks(), "dshtavern: sidebar workspace marks");
			installTavernBeatRecords(ctx);
		}
		//#endregion
		exports.MODE_LABELS = MODE_LABELS;
		exports.PANEL_ID = PANEL_ID;
		exports.PanelView = PanelView;
		exports.TavernPanel = TavernPanel;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
