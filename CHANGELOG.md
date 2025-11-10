## v0.2.0 [2025-11-10]

_Major Changes_

* Restore compatibility with Tailpipe `v0.7.0` (and later) by consuming the new SQL init scripts returned from `tailpipe connect`, replacing the legacy database-path flow ensuring the MCP server boots against Tailpipe’s new lakehouse format and keeps pace with the DuckLake rollout described in [Tailpipe’s next evolution: Building on DuckLake](https://tailpipe.io/blog/tailpipe-meets-ducklake).

## v0.1.1 [2025-04-16]

_Bug fixes_

* Remove unused best_practices prompt

## v0.1.0 [2025-04-16]

_What's new_

* Initial version of Tailpipe MCP server
* Support for querying cloud and security logs using AI