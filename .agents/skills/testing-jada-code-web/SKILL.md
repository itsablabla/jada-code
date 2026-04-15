# Testing Jada Code Web UI

## Overview
Jada Code's web UI is the full Goose Desktop Electron app ported to run standalone in a browser. The renderer (`ui/desktop/`) is built with Vite using a web-specific config (`vite.web.config.mts`), and all `window.electron.*` IPC calls are replaced by web shims (`src/web-shim.ts`).

## Architecture
- **Static web app**: Built from `ui/desktop/` with `vite.web.config.mts` → produces `dist/` with HTML/JS/CSS
- **Backend**: `goosed` REST API server (Rust binary, compiled from `crates/goose-server/`)
- **Auth**: nginx injects `X-Secret-Key` header on all `/api/*` proxied requests. The web-shim generates a random key per session, but nginx overrides it.
- **Entry point**: `src/web-entry.ts` → installs shims → imports `renderer.tsx`
- **Routing**: HashRouter (`#/pair`, `#/settings`, `#/recipes`, etc.)

## Deployed Environment
- **Web UI**: https://coder.garzaos.online (static files at `/opt/jada-code-web/html/`)
- **goosed API**: port 3270 on VPS 83.228.213.100 (systemd service `goosed.service`)
- **nginx config**: `/etc/nginx/sites-enabled/coder.garzaos.online`
- **Model**: moonshotai/kimi-k2 via OpenRouter
- **Nextcloud embed**: https://next.garzaos.online/apps/external/5/

## How to Build & Deploy
```bash
# On VPS (83.228.213.100)
cd /opt/jada-code-web/jada-code/ui/desktop
npm install
npx vite build --config vite.web.config.mts --outDir /opt/jada-code-web/html
```

## Key Test Procedures

### 1. Verify app loads
- Navigate to https://coder.garzaos.online
- Expect: Sidebar with Home, Chat, Recipes, Skills, Apps, Scheduler, Extensions, Settings
- Expect: Dashboard heading, session stats, model name in status bar
- Expect: Toast "Successfully loaded N extensions"
- Fail if: "Unable to connect to Goose server" error (OnboardingGuard failed)

### 2. Chat E2E
- Type a simple question (e.g., "What is the capital of France?") and click Send
- Expect: "goose is working on it..." loading state
- Expect: Streaming response appears within 30 seconds
- Expect: Session auto-named in sidebar
- Fail if: No response or error toast

### 3. Sidebar navigation
- Click through each sidebar item: Recipes, Skills, Apps, Scheduler, Extensions, Settings
- Expect: Each view renders with heading and appropriate content/empty state
- Fail if: Blank white screen (component crash) or JS error dialog

### 4. Settings provider config
- Navigate to Settings → Models tab
- Expect: Shows configured model name and provider (e.g., "moonshotai/kimi-k2" / "OpenRouter")
- Fail if: Infinite loading or empty provider section

### 5. Extensions
- Navigate to Extensions
- Expect: Grid of default extensions (all toggled ON) and available extensions
- Expect: "Add custom extension" and "Browse extensions" buttons

## Key Code Paths
- `src/web-shim.ts` — All `window.electron.*` replacements
- `src/renderer.tsx` — Configures API client with `getGoosedHostPort()` and `getSecretKey()`
- `src/components/onboarding/OnboardingGuard.tsx` — Reads `GOOSE_PROVIDER` from goosed config API
- `src/sessions.ts` — Session creation via goosed REST API
- `vite.web.config.mts` — Web-only Vite build config

## Known Behaviors
- Dashboard heading has a typewriter animation that may briefly show garbled characters mid-transition. This is cosmetic and from the original Goose codebase.
- The web-shim generates a random `X-Secret-Key` per browser session, but nginx overrides this with the real key — so the client-side key doesn't matter for auth.
- File system operations (open file dialog, save file, etc.) are stubbed in the web shim and do nothing. This is expected — web browsers can't access the native filesystem.
- The `goosed` binary must be compiled from source (Rust) since the official Docker image only ships the `goose` CLI with ACP protocol, not the REST API server.

## Devin Secrets Needed
- `VPS_ROOT_PASSWORD` — SSH access to 83.228.213.100
- `OPENROUTER_API_KEY` — For LLM API calls via OpenRouter

## Troubleshooting
- If goosed is not responding, check: `ssh root@83.228.213.100 'systemctl status goosed'`
- If web UI shows "Unable to connect", verify: `curl -s https://coder.garzaos.online/api/status` should return "ok"
- If chat doesn't respond, check goosed logs: `ssh root@83.228.213.100 'journalctl -u goosed -n 50'`
- If extensions fail to load, verify goosed has the correct config: `curl -s -H 'X-Secret-Key: <key>' http://83.228.213.100:3270/config/read -d '{"key":"GOOSE_PROVIDER","is_secret":false}'`
