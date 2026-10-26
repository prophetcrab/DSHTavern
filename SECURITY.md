# Security and capability disclosure

DSHTavern is a role-play plugin for DeepSeek Harness. It reads and writes story
files, serves its editing panels over loopback HTTP, and — only when you enable
the optional image sub-plugin — calls a third-party text-to-image API with a
credential you supply.

This document states exactly what the plugin does with each capability, so a
reviewer can match every automated scan signal to a stated purpose. It is a
disclosure, not a claim that the plugin is audited.

## Capability summary

| Capability | Used | Scope |
|---|---|---|
| Filesystem | yes | tavern workspace directories, plus one read of `DSH_HOME` to locate the default tavern root |
| Network (inbound) | yes | loopback-only HTTP routes registered on the harness web server |
| Network (outbound) | only with the image sub-plugin | the image provider endpoint you configure, plus the provider-returned image URL |
| Credentials | only with the image sub-plugin | image provider API keys, resolved through the harness credential service |
| Child processes | **no** | the plugin never spawns a process, executes a shell, or runs an installed package |

The plugin declares no install-time or build-time lifecycle scripts for
consumers. `prepublishOnly` runs only on the maintainer's machine before an npm
release.

## Filesystem

Writes stay inside one tavern workspace directory. A workspace is a directory
the harness already registers, carrying a `.dshtavern/tavern.json` marker.

```text
<tavern>/
  characters/<card-id>.charc     # character cards
  .dshtavern/
    tavern.json                  # workspace marker
    worldbook.json               # workspace-level lore
    agent.json                   # orchestration settings
    persona.json                 # player persona
    image.json                   # image sub-plugin settings (no secrets)
    prompts/prompt.json          # player-facing prompt layout
    prompts/director.json        # director prompt layout
    stories/<session>/
      opening.json               # generated opening script
      stage.jsonl                # appended narration and speech
      world.json                 # director-private world state
      beats/<timestamp>.json     # per-beat evidence
      images/                    # generated scene images
    tracker/                     # story-summary settings and ledgers
```

Reads follow the same rule: everything the plugin reads lives under the
workspace it was asked about. The single exception is `defaultTavernRoot()`,
which reads `DSH_HOME` (falling back to `~/.dsh`) to compute where a *new*
tavern directory should go when the user does not name a path. That value is
used to construct a path; it is not sent anywhere.

The plugin has no access to files outside tavern workspaces and makes no attempt
to enumerate the user's filesystem. There is no upload, no telemetry, and no
remote logging of file contents.

## Network, inbound

All routes are served by the harness web server and are loopback-only: a request
from any address other than `127.0.0.1`, `::1`, or `::ffff:127.0.0.1` receives
`403`, and so does any request whose `Sec-Fetch-Site` header is `cross-site`.
Requests carry the harness session token.

| Prefix | Purpose |
|---|---|
| `/tavern/*` | tavern state, character cards, worldbook, personas, prompt layout, agent settings, opening, regeneration, assembly preview |
| `/tavern-stats/*` | read-only token and context usage |
| `/tavern-tracker/*` | read-only story-summary ledger |
| `/tavern-image/*` | image sub-plugin settings and generation (absent when its bundle row is removed) |

These routes read and write the same workspace files described above. None of
them proxy a request to an arbitrary destination: the handler decides the
target, never the caller.

## Network, outbound

The core plugin makes no outbound request. Prompt assembly and orchestration go
through the harness LLM service, which owns its own provider connections.

The optional image sub-plugin (`dshtavern/image`) makes outbound requests in two
cases, both only after the user configures a provider in that tavern:

1. **Provider API call.** The request goes to the endpoint recorded in that
   tavern's image configuration. Defaults shipped with the plugin:
   `https://api.openai.com/v1` (OpenAI Images) and
   `https://visual.volcengineapi.com` (Volcengine Jimeng). A user-supplied
   `baseUrl` takes precedence, so the effective destination is whatever the
   workspace owner configured.
2. **Result download.** Some providers return a URL instead of inline bytes; the
   plugin then fetches that URL to store the image. This fetch deliberately does
   not forward credentials, refuses redirects, enforces a byte ceiling, and
   accepts only `https:` URLs or loopback `http:` URLs. Anything else is
   rejected as unsafe rather than followed.

Nothing else leaves the machine. There is no analytics endpoint, no update
check, and no license verification call.

## Credentials

The core plugin reads no credential. It does not touch `DEEPSEEK_API_KEY` or any
harness provider key: model calls are delegated to the harness LLM service,
which resolves its own credentials.

The image sub-plugin needs one provider credential, and resolves it through the
harness credential service rather than from disk or from a config file:

| Reference | Provider |
|---|---|
| `DSHTAVERN_IMAGE_OPENAI_API_KEY` | OpenAI Images |
| `DSHTAVERN_IMAGE_JIMENG_ACCESS_KEY` + `..._SECRET_KEY` | Volcengine Jimeng |
| `DSHTAVERN_IMAGE_GEMINI_API_KEY` | Gemini image |

Requirements to use it:

- The sub-plugin's bundle row ships mounted, but it never generates anything on
  its own: each tavern must separately have image configuration written, and
  only a user action in that tavern's image panel starts a generation. Removing
  the `dshtavern-image` row unregisters `/tavern-image/*` entirely.
- A credential is read only when that tavern generates an image.
- The key is used only in the provider request's authorization header. It is
  never written to a story file, a session event, a log line, or an error
  message; errors report HTTP status and a bounded provider message.
- `image.json` records the provider choice and non-secret knobs — endpoint,
  region, model, presets, timeouts. Secrets live in the harness credential
  store.

## Failure bounds

- **A failing model call** ends the beat with an error. A beat is committed to
  the stage and world files only after its model calls succeed, so a failed beat
  leaves the story unchanged.
- **A cancelled turn** does not stage partial text; the player asked to abandon
  the beat.
- **A failing image call** reports the provider status and leaves the story
  untouched. Image generation never blocks narration.
- **A missing credential** is reported as a configuration error before any
  request is sent.
- **A malformed request body** is rejected with a typed error and a 4xx status;
  no partial write occurs.
- **Prompt assembly** failures are logged and leave the previous prompt in
  place rather than sending an empty one.

## Dependencies

Runtime dependencies are limited to `@deepseek-ai/cordis` and
`@deepseek-ai/dsh-workspace` as peer dependencies; the harness supplies both.
The image sub-plugin adds no HTTP client dependency — it uses the platform
`fetch`. There is no postinstall hook, no native module, and no bundled binary.

## Reporting

Open an issue at <https://github.com/prophetcrab/DSHTavern/issues>. For a
suspected vulnerability, describe the affected route or file path and the
observed behavior; please do not attach real API keys or story content.
