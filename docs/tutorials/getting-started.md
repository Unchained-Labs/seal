# Tutorial: Getting Started

This tutorial sets up seal against a local otter instance.

## 1. Configure env

```bash
cp .env.example .env
```

Defaults:

- `VITE_OTTER_URL=/api`
- `VITE_OTTER_PROXY_TARGET=http://localhost:8080`

## 2. Install and run

```bash
nvm use 22
npm install
npm run dev
```

## 3. Validate connectivity

- Open seal UI.
- Confirm queue/history load.
- Submit a test prompt.

## 4. Validate voice flow

- Record a voice prompt.
- Confirm transcription appears.
- Confirm job enters queue and updates live.
