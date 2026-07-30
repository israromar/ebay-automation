# Package justification

| Package                   | Required because            | Bundle/runtime impact     | Built-in alternative     | Maintenance        | Security         |
| ------------------------- | --------------------------- | ------------------------- | ------------------------ | ------------------ | ---------------- |
| next                      | App dashboard + API routes  | Framework                 | Separate Express+React   | Active             | Keep updated     |
| prisma / @prisma/client   | Typed ORM + SQLite/Postgres | Server-only               | Raw SQL                  | Active             | Keep updated     |
| zod                       | Request/boundary validation | Small                     | Manual validation        | Active             | Low risk         |
| playwright                | PoC traces + browser tests  | Dev / optional collectors | None                     | Active (Microsoft) | Dev dependency   |
| googleapis                | Official Sheets export      | Server-only               | REST fetch by hand       | Active (Google)    | OAuth/scopes     |
| @modelcontextprotocol/sdk | Phase 5 internal MCP        | Separate process          | Skip MCP                 | Active             | Privileged — pin |
| vitest                    | Unit tests                  | Dev                       | node:test                | Active             | Dev              |
| date-fns / nanoid         | Light utilities             | Small                     | Intl / crypto.randomUUID | Active             | Low              |

Do not add packages without updating this table.
