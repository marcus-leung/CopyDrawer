# Contributing

Thanks for your interest in CopyDrawer.

## Issues and ideas: yes, please

- **Bugs:** [open an issue](https://github.com/marcus-leung/CopyDrawer/issues/new) with what you did, what you expected, what happened, and your Chrome version. A screenshot helps.
- **Ideas:** open an issue that describes the problem you want solved, not only the feature.
- **Security problems:** don't open an issue. See [SECURITY.md](SECURITY.md).

## Pull requests: not yet

Pull requests aren't accepted for now. Keeping a single author keeps the licensing simple while the extension is young. If you've found a fix, describe it in an issue and it can go in from there.

## Running it yourself

You're welcome to build, run and change your own copy under the [GPL-3.0](LICENSE).

```bash
pnpm install
pnpm dev     # Chrome with the extension loaded and hot reload
pnpm check   # everything CI runs: types, lint, format, unit and end-to-end tests, build, manifest check
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together.
