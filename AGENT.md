# Agent Notes

## Scope

This file is for agent/operator-specific execution notes for this repository and local machine behavior.

## npm install / dependency setup

- Do not assume `npm install` will work normally in this repo/environment.
- This project should use `Node v20.19.2` via `nvm`. Do not use Node 23+ here.
- `node_modules` may need to be copied from another working machine because direct package downloads can fail in this environment.

## Next.js native binary note

- The copied `node_modules` was missing `@next/swc-darwin-arm64`, which is a platform-specific native binary.
- Install it manually only when needed, using the Wix private registry over VPN:

```bash
npm install @next/swc-darwin-arm64 --registry http://npm.dev.wixpress.com
```

- Do not add `@next/swc-darwin-arm64` to `package.json`. It is treated as a local environment fix, not a normal project dependency.

## Guidance for future agents

- Before dependency work, verify `node -v` is `v20.19.2`.
- If `npm install` hangs or loops, do not keep retrying blindly.
- Prefer preserving existing `node_modules` unless the user explicitly requests a clean reinstall.
- If dependencies are missing, first decide whether to restore from a working machine or use the Wix registry/VPN flow above.
