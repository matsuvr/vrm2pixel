# License texts

The application source and documentation are covered by the root [MIT License](../LICENSE).

The following original demo assets are dedicated to the public domain under [CC0 1.0](CC0-1.0.txt), as declared by their generator and model metadata:

- `public/demo.vrm`
- `tests/fixtures/demo-vrm0.vrm`
- `scripts/create-demo.mjs`

Third-party packages retain their own licenses. `npm run build` generates `public/THIRD_PARTY_LICENSES.txt` from the production dependencies in `package-lock.json`, including their license and NOTICE files. It also publishes the application license, CC0 text and the root third-party notices. Generated public copies are excluded from Git.

These packages omit the license file from their npm tarballs; the generator uses the upstream texts stored here:

| Local text | Packages | Upstream source |
| --- | --- | --- |
| `Apache-2.0.txt` | `@cloudflare/puppeteer` 2.0.0 | [cloudflare/browser-run at 28e5649](https://github.com/cloudflare/browser-run/blob/28e5649533b305faf1c06a0b91e4415184792045/LICENSE) |
| `Apache-2.0.txt` | `puppeteer-core` 25.18.0 | [puppeteer at ec386eb](https://github.com/puppeteer/puppeteer/blob/ec386eb23d1a4d9c206c8ea04dcc72fd023b6182/LICENSE) |
| `Apache-2.0.txt` | `@puppeteer/browsers` 3.2.7 | [puppeteer at f255d23](https://github.com/puppeteer/puppeteer/blob/f255d2374e24a24880d4c37582d53f422377c7d4/LICENSE) |
| `undici-MIT.txt` | `undici-types` 5.26.5 | [undici at 9197790](https://github.com/nodejs/undici/blob/9197790ae0d015b40b75fd0c5cdb7420704b5272/LICENSE) |

The CC0 legal text is from [Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt).
