/**
 * The role-play tavern preset, re-exported under this package.
 *
 * The preset behaviour is the upstream `@deepseek-ai/dsh-agent-preset` plugin;
 * this subpath exists only so the plugin manager can show the row with the
 * tavern's own name and description. Display metadata is read from
 * `<specifier>/locale/en.json`, so a row that names a shared upstream package
 * can never say what that particular row is for.
 * @module dshtavern/preset-rp
 */
export { default } from '@deepseek-ai/dsh-agent-preset';
