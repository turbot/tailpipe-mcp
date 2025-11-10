## Testing Tailpipe MCP

This guide describes the local test workflow for the Tailpipe MCP server, including automated suites and manual MCP Inspector checks.

---

### Prerequisites

- Node.js ≥ 20 (matches the project’s `engines.node` requirement)
- DuckDB (bundled dependency) downloads extensions as needed
- Tailpipe CLI available if you want to exercise live tooling scenarios

Install project dependencies once:

```bash
npm install
```

---

### Automated Test Suites

The project uses Jest (with `ts-jest`) and TypeScript `isolatedModules`. All test commands run with `NODE_OPTIONS=--experimental-vm-modules` so ESM modules load correctly.

| Task | Command | Notes |
| --- | --- | --- |
| Run entire suite (unit + integration + e2e) | `npm test` | fastest way to ensure everything passes |
| Watch mode for rapid feedback | `npm run test:watch` | reruns impacted tests on file change |
| Coverage report | `npm run test:coverage` | generates text + lcov output under `coverage/` |
| Target unit tests | `npm run test:unit` | exercises `test/unit/**` including mocks and fixtures |
| Target integration tests | `npm run test:integration` | uses real DuckDB execution against sample init scripts |
| Target end-to-end tests | `npm run test:e2e` | spins up mocked MCP server infrastructure |

> **Tip:** Set `TAILPIPE_MCP_LOG_LEVEL=error` when running tests to keep stdio clean (already default in suites).

---

### Test Fixtures

`test/fixtures/init-scripts/` contains representative SQL scripts:

- `simple.sql` – minimal schema and data
- `with-string-semicolons.sql` – strings that contain semicolons
- `with-comments.sql` – line and block comments with semicolons
- `complex.sql` – DuckDB extension operations and transactional statements

Integration tests load these files to confirm the parser + execution pipeline handles real-world Tailpipe init scripts.

---

### Manual Verification with MCP Inspector

In addition to automated suites, exercise the MCP protocol end-to-end:

1. **Build the project** (ensures `dist/` is up to date):
   ```bash
   npm run build
   ```

2. **Launch MCP Inspector** with your init script:
   ```bash
   npx @modelcontextprotocol/inspector dist/index.js /absolute/path/to/tailpipe_init.sql
   ```

3. **Interact via the Inspector UI**:
   - Verify connection metadata (`status` resource).
   - Invoke tools such as `tailpipe_query`, `tailpipe_table_list`, etc.
   - Watch console output for any unexpected warnings or errors.

4. **Optional:** run the built server directly to validate stdio transport:
   ```bash
   node dist/index.js /absolute/path/to/tailpipe_init.sql
   ```
   Configure your MCP-capable client (e.g., Cursor, Claude Desktop) to point at the local `dist/index.js` binary for a true end-user flow.

---

### CI Pipeline

The GitHub Actions workflow (`.github/workflows/test.yml`) mirrors the local sequence:

1. `npm ci`
2. `npm run build`
3. `npm test` (with `NODE_OPTIONS=--experimental-vm-modules`)

Keeping local runs green ensures CI remains stable.

---

### Troubleshooting

- **ESM errors**: make sure Node 20+ is in use and commands include `node --experimental-vm-modules`.
- **DuckDB extension downloads**: ensure outbound network access when running integration tests the first time.
- **Verbose logging**: set `TAILPIPE_MCP_LOG_LEVEL=debug` temporarily when diagnosing tool handlers, then revert to reduce noise.

Following this workflow provides fast feedback from unit tests while maintaining confidence via integration, end-to-end, and manual MCP Inspector validation.***

