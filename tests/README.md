# Extension verification

Run with Node.js 24:

```sh
npm test
npm run typecheck
npm run build
npm run verify:build
```

The active extension is built from the WXT entrypoints and TypeScript/React modules. Legacy extension source and vendored libraries have been removed; the manifest fixture records the original contract. The optional `gcp/` proxy is a separate supported service. The build verification compares the generated manifest with the fixture and validates critical resources.

The tests cover settings and prompts, state and orchestration, providers, content extraction, page actions, screenshots, messaging, voice and permissions. They use fake browser APIs and provider credentials; they do not contact AI providers. Coverage gaps remain in asynchronous UI races, injection edge cases, scrolling capture scaling and failure restoration, provider variants, worker restarts, and real speech and permission behavior.

After changes, build before running the packaged browser checks:

```sh
node scripts/smoke-extension.mjs <browser-binary>
node scripts/smoke-extension.mjs <browser-binary> --upgrade
```

On 2026-11-27, Chrome and Edge passed both checks after legacy source removal. The smoke test checks initialization, settings, mocked vLLM chat, fake microphone permission, page discovery and actions, screenshot dimensions, Readability, and resources. The upgrade test reconstructs the prior extension from Git history, then checks settings markers under the same unpacked extension ID. This is not a store upgrade. Full scrolling screenshot capture, visible layout, real microphone/clipboard, real provider requests, worker restarts and GitHub Actions remain unverified.

The scrolling screenshot currently returns to the top on success and does not restore the original position on failure. Its existing injection uses the `function` property, which differs from the documented `func` property; dimensions passed the browser smoke test, but scrolling itself needs a dedicated browser test before changing this behavior.

The build reports a side panel chunk larger than 500 kB; this is a warning, not a failed build.
