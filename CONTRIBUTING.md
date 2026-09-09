# Contributing

Thanks for helping improve Franchise Fantasy Companion.

## Before opening an issue

- Confirm the problem occurs on the newest public beta.
- Export a companion backup before testing destructive reset actions.
- Never upload a Madden Franchise save or a full local filesystem path.
- Create a privacy-safe support report from **Settings** when useful.

## Development

Requirements: Node.js 24 and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

Keep save access read-only. New extraction code must operate on the temporary copy created by the main process, never the original `CAREER-` file.

By contributing, you agree that your contribution is licensed under the MIT License.

