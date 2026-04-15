<div align="center">

# Jada Code

_AI coding agent for Garza OS — powered by [Goose](https://github.com/aaif-goose/goose)_

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"
    ><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
  <a href="https://github.com/itsablabla/jada-code"
    ><img src="https://img.shields.io/badge/fork-aaif--goose%2Fgoose-orange" alt="Fork"></a>
</p>
</div>

**Jada Code** is a custom distribution of [Goose](https://github.com/aaif-goose/goose) — the open-source AI agent by AAIF (Agentic AI Foundation). It's preconfigured for the Garza OS ecosystem with Kimi K2.5 via OpenRouter, MCP extensions for Nextcloud, and server-first deployment.

## What's different from upstream Goose

- **Branded as Jada Code** — system prompt, Dockerfile, metadata
- **Preconfigured for Garza OS** — OpenRouter provider, Kimi K2.5 model
- **Server-first deployment** — Docker Compose for headless VPS operation
- **MCP extensions** — Nextcloud Passwords, Nextcloud files, and more

## Quick Start (Server)

```bash
# Clone
git clone https://github.com/itsablabla/jada-code.git
cd jada-code

# Run the server
docker compose -f docker-compose.server.yml up -d

# Server available at http://localhost:3000
```

## Quick Start (CLI)

```bash
# Build from source
cargo build --release --package goose-cli

# Run
GOOSE_PROVIDER=openrouter \
OPENROUTER_API_KEY=your-key \
./target/release/goose session
```

## Configuration

Jada Code uses the same configuration system as Goose. Config lives in `~/.config/goose/`:

- `profiles.yaml` — Provider and extension settings
- `config.yaml` — Global preferences

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOSE_PROVIDER` | `openrouter` | AI provider |
| `GOOSE_MODEL` | `moonshotai/kimi-k2` | Model to use |
| `OPENROUTER_API_KEY` | - | OpenRouter API key |
| `GOOSE_HOST` | `127.0.0.1` | Server bind address |
| `GOOSE_PORT` | `3000` | Server listen port |
| `GOOSE_DISABLE_TELEMETRY` | `1` | Telemetry disabled by default |

## MCP Extensions

Jada Code ships with preconfigured MCP extensions:

- **Developer** (built-in) — Shell commands, file editing, code analysis
- **Memory** (built-in) — Persistent storage across sessions
- **nc-passwords-mcp** — Nextcloud Passwords vault access

Add more extensions via `profiles.yaml` or the `goose configure` CLI.

## Docker Deployment

### Server mode (headless)

```bash
docker build -t jada-code .

docker run -d \
  --name jada-code \
  --restart unless-stopped \
  -p 3000:3000 \
  -e GOOSE_PROVIDER=openrouter \
  -e GOOSE_MODEL=moonshotai/kimi-k2 \
  -e OPENROUTER_API_KEY=your-key \
  -e GOOSE_HOST=0.0.0.0 \
  -e GOOSE_PORT=3000 \
  -e GOOSE_DISABLE_TELEMETRY=1 \
  -v jada-code-data:/home/goose/.local/share/goose \
  -v jada-code-config:/home/goose/.config/goose \
  jada-code serve --host 0.0.0.0 --port 3000 --with-builtin developer,computercontroller,memory
```

## Upstream

This is a fork of [aaif-goose/goose](https://github.com/aaif-goose/goose) (Apache 2.0). Goose is part of the [Agentic AI Foundation (AAIF)](https://aaif.io/) at the Linux Foundation.

To sync with upstream:
```bash
git remote add upstream https://github.com/aaif-goose/goose.git
git fetch upstream
git merge upstream/main
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
