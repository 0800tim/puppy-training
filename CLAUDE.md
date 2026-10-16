# puppy-training

Tim's puppy training app. Internal project, created 16 October 2026.

The first build was done in a claude.ai chat session; Tim is bringing that code
here to take it further and run it on clawdia.

> **The Hivemind**: this server's long-term memory vault lives at
> /srv/projects/hivemind (read its _CLAUDE.md). Project note:
> hivemind/projects/puppy-training.md. Log sessions in
> hivemind/logs/2026/10-puppy-training.md.

## House rules (shared box)

- Stop, start and restart services by unit name only. Never kill by a generic
  pattern. See hivemind/guides/shared-box-process-hygiene.md.
- Before picking a port, check `ss -ltnp`. Any long-running unit is
  `Restart=always`, `RestartSec=5`.
- Commit as 0800tim@gmail.com. Commit only your own files.
- Test before anything goes live, and again on the live URL afterwards.
- NZ English, no em dashes.
