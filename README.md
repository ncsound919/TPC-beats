# TPC-beats — Deterministic MPC Sampler

[![CI](https://github.com/ncsound919/TPC-beats/actions/workflows/ci.yml/badge.svg)](https://github.com/ncsound919/TPC-beats/actions/workflows/ci.yml)

A single-screen, browser-based MPC-style beat workstation with a deterministic DSP architecture. Built with React 19 + Vite, powered by the Web Audio API, and optionally enhanced with Gemini AI for intelligent sample chopping.

## Features

- **MPC Pad Grid** — 16 velocity-sensitive pads with per-pad sample assignment, multi-layer support, and drag-and-drop sample loading
- **Step Sequencer** — PPQN-accurate sequencer with swing, record-to-pattern, and per-step velocity editing
- **Juno-style Subtractive Synth** — DCO, VCF (LP/HP/BP), VCA, LFO, envelope, unison, and portamento
- **DX7 FM Synthesizer** — Full 6-operator FM engine with envelope and keyboard scaling, compatible with DX7 patch data
- **808 Rompler** — TR-808-style drum rompler with pitch, decay, and tone controls per voice
- **Chord Generator** — Algorithmic chord and progression builder for the synth engine
- **AI Chop Agent** — Gemini-powered audio transient detector that auto-slices samples and assigns them to pads using spectral flux + RMS analysis
- **Master Mixer** — Per-channel volume/pan with EQ, compression, reverb, and master bus limiting/maximizing
- **Project Persistence** — Auto-save to `localStorage`, manual save/load as JSON, and export/import for portability
- **Undo / Redo** — Full state history stack

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Audio | Web Audio API (custom DSP engines) |
| AI | Google Gemini API (`@google/genai`) |
| Server | Express (API proxy for Gemini key) |
| Testing | Playwright (E2E) |
| CI | GitHub Actions |

## Project Structure

```
tpc-beats/
├── src/
│   ├── audio/
│   │   ├── agents/       # ChopAgent — AI-driven sample slicer
│   │   ├── synths/       # JunoEngine, DX7Engine, Rompler808Engine, ChordGenerator
│   │   ├── AudioEngine.ts      # Central Web Audio graph
│   │   ├── FXChain.ts          # Effects bus routing
│   │   ├── ProgramEngine.ts    # Program/patch management
│   │   ├── SequencerEngine.ts  # PPQN step sequencer
│   │   └── Transport.ts        # BPM / clock
│   ├── components/
│   │   ├── MPC/          # PadGrid, DrumLibrary, WaveformDisplay, Transport, SequencerGrid
│   │   ├── Synth/        # JunoSynth UI
│   │   ├── Rompler/      # Rompler808 UI
│   │   └── Mixer/        # MasterMixer UI
│   ├── persistence/
│   │   ├── LocalProjectStore.ts  # localStorage save/load
│   │   ├── ExportImport.ts       # JSON export/import
│   │   └── ProjectSchema.ts      # Versioned project schema
│   ├── App.tsx           # Root component + state
│   └── types.ts          # Shared TypeScript interfaces
├── tests/
│   ├── smoke.spec.ts     # Basic smoke test
│   └── ui.spec.ts        # Tab switching & transport E2E tests
├── .github/workflows/
│   └── ci.yml            # GitHub Actions CI pipeline
├── eslint.config.js      # ESLint v9 flat config
├── vite.config.ts
├── playwright.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- **Node.js** v20+
- A **Gemini API key** (free tier works) — get one at [aistudio.google.com](https://aistudio.google.com)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ncsound919/TPC-beats.git
cd TPC-beats

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local and set your Gemini API key:
# GEMINI_API_KEY=your_key_here

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Run Playwright E2E tests |
| `npm run lint` | TypeScript type-check + ESLint |
| `npm run lint:types` | TypeScript type-check only |
| `npm run clean` | Remove dist and build artifacts |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (for AI features) | Google Gemini API key for the Chop Agent |
| `APP_URL` | No | Base URL for self-referential links (auto-set by AI Studio) |

Copy `.env.example` to `.env.local` and fill in your values. Never commit `.env.local` — it is gitignored.

## Running Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps chromium

# Run all E2E tests
npm test

# Open Playwright UI for interactive debugging
npx playwright test --ui
```

## AI Studio Deployment

This project is also deployable via Google AI Studio:
[https://ai.studio/apps/7ec855d8-4ffb-47fb-ad93-ad26679a552d](https://ai.studio/apps/7ec855d8-4ffb-47fb-ad93-ad26679a552d)

The server-side Express proxy handles the Gemini API key securely — it is never exposed to the client.

## License

This project is private. All rights reserved.
