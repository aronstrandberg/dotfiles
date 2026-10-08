# Pi configuration

Run `sh ../pi.sh` from this directory to install preferences and extensions. The installer preserves unrelated local settings and generated extensions. It does not install the development tools.

Use Node.js 22.19 or newer. Run `npm ci`, then `npm run check` to lint, check formatting, type-check, and test. Run `npm run lint:fix` followed by `npm run format` after editing extensions or tests.

TypeScript enables the full `strict` family and additional indexed-access, optional-property, unused-code, and control-flow checks. `skipLibCheck` excludes dependency declarations because Pi 1.0.4 has declaration errors; extension source still receives every configured check. The Node tests are JavaScript modules and run against the real Pi theme and keyboard APIs.

`tools/oxlint/anti-slop/UPSTREAM.md` records the vendored rule source. Update `oxlint` and `@oxlint/plugins` together at the same exact version. The Pi SDK dependencies match the installed Pi version; update them together when upgrading Pi.
