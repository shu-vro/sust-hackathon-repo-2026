# QueueStorm Investigator

Support-ticket triage API for the **SUST CSE Carnival 2026 · Codex Community Hackathon** (Online Preliminary).

An AI/API support copilot for digital finance. The service receives a customer complaint plus recent transaction history, investigates what actually happened, classifies and routes the case, and drafts a safe reply for support agents. It is a **copilot for support agents**, not an autonomous financial decision maker.

**Judge-facing endpoints**

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/health` | Readiness check — returns `{"status":"ok"}` within 60s of start |
| `POST` | `/analyze-ticket` | Analyze one ticket; returns structured investigation JSON within 30s |

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- `OPENROUTER_API_KEY` (optional for local dev — see [Models](#models); required for LLM investigation and evaluation)
- Optional: Docker + Docker Compose (for deployment)

### Install and run locally

```bash
git clone https://github.com/shu-vro/sust-hackathon-repo-2026.git
cd sust-hackathon-repo-2026
bun install
cp .env.example .env   # add your OPENROUTER_API_KEY
bun run start          # http://0.0.0.0:8000
```

Bun loads `.env` automatically. See [Environment variables](#environment-variables) for all options.

```bash
bun run dev      # watch mode
# or
bun run start    # production-style
```

Verify readiness:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

Analyze a ticket (minimal example):

```bash
curl -s -X POST http://localhost:8000/analyze-ticket \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to a wrong number around 2pm today.",
  "language": "en",
  "transaction_history": [
    {
      "transaction_id": "TXN-9101",
      "timestamp": "2026-04-14T14:08:22Z",
      "type": "transfer",
      "amount": 5000,
      "counterparty": "+8801719876543",
      "status": "completed"
    }
  ]
}
EOF
```

A worked sample request/response pair is in [`docs/sample-output.json`](docs/sample-output.json) (generated from `SAMPLE-01`).

### Docker

```bash
cp .env.example .env   # set OPENROUTER_API_KEY and optional PORT
docker compose --env-file .env up --build
# listens on http://localhost:3001 by default (see docker-compose.yml)
```

Build image only:

```bash
docker build -f Dockerfile.bun -t sust-hackathon .
docker run --env-file .env -p 3001:3001 sust-hackathon
```

---

## API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status":"ok"}` within 60s of start |
| `POST` | `/analyze-ticket` | Accepts one ticket; returns structured investigation JSON within 30s |

**Headers:** `Content-Type: application/json`

### HTTP status codes

| Code | When |
|------|------|
| `200` | Successful analysis |
| `400` | Malformed JSON or missing required fields |
| `415` | Missing or wrong `Content-Type` |
| `422` | Valid schema but semantically blocked (e.g. prompt injection in complaint) |
| `429` | Rate limit exceeded (60 req/min per IP on `/analyze-ticket`) |
| `500` | Internal error (no stack traces or secrets in body) |

Request and response schemas match the [official problem statement](docs/problem-statement.md). Public sample cases live in `src/routes/analyze-ticket/fixtures/SUST_Preli_Sample_Cases.json` (also re-exported in `sample-cases.fixture.ts` for tests).

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| HTTP | Express 5 |
| Validation | Zod 4 |
| LLM orchestration | LangChain (`@langchain/openrouter`) |
| Security middleware | Helmet, CORS, rate limiting |
| Container | Docker (`Dockerfile.bun`, `docker-compose.yml`) |

---

## Architecture

The service uses a three-layer pipeline:

```
POST /analyze-ticket
        │
        ▼
┌─────────────────────┐
│  Layer 1 — Input    │  Zod schema validation, prompt-injection /
│  guardrails         │  credential-harvesting detection, optional LLM gate
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Layer 2 —          │  LLM investigator (primary) with few-shot examples
│  Investigator       │  from the official sample pack; rule-based fallback
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Layer 3 — Output   │  Structural guardrails (txn ID in history),
│  safety             │  deterministic safety sanitization on replies
└─────────────────────┘
```

### AI approach

1. **Primary path — structured LLM investigation** (`ticket-investigator.llm.ts`)
   - Single-shot call with a system prompt that encodes evidence rules, enum taxonomy, routing, and safety constraints.
   - Few-shot examples from all 10 official sample cases teach correct investigator reasoning.
   - Model selection: `gemini-2.5-flash` for simpler tickets; `gemini-3.1-pro-preview` for complex evidence (multiple transactions, Bangla, merchant cases).
   - Structured output via Zod schema; 25s internal timeout to stay under the 30s harness limit.

2. **Fallback path — rule-based investigator** (`ticket-investigator.rules.ts`)
   - Pattern matching on complaint text (English + Bangla), amount/time/phone extraction, transaction scoring, and evidence verdict derivation.
   - Used when `OPENROUTER_API_KEY` is unset or the LLM call fails — keeps the API reachable and schema-valid during judging.

3. **Evaluation pipeline** (development)
   - `bun run eval:sample-cases` hits a running server with all 10 public cases in parallel.
   - Optional Gemini Pro judge compares actual vs expected decision fields and safety compliance.

Key source files:

| File | Role |
|------|------|
| `src/routes/analyze-ticket/ticket-investigator.agent.ts` | LLM + rules orchestration |
| `src/routes/analyze-ticket/ticket-investigator.prompt.ts` | Investigator prompt + few-shot I/O |
| `src/routes/analyze-ticket/ticket-investigator.rules.ts` | Deterministic fallback investigator |
| `src/routes/analyze-ticket/ticket-investigator.safety.ts` | Output safety post-processing |
| `src/routes/analyze-ticket/ticket-investigator.guardrails.ts` | Structural output checks |
| `src/utils/validate-user-input.ts` | Input guardrails (injection, harvesting) |

Orchestration: `src/routes/analyze-ticket/analyze-ticket.controller.ts`

---

## Models

All models are accessed through [OpenRouter](https://openrouter.ai), routed to **Google AI Studio**. No models are baked into the Docker image.

| Model | OpenRouter ID | Where used | Why |
|-------|---------------|------------|-----|
| Gemini 2.5 Flash Lite | `google/gemini-2.5-flash-lite` | Input guardrail LLM gate (`ENABLE_LLM_GUARDRAIL=true`) | Low cost, fast, deterministic (`temperature=0`); catches adversarial complaints without adding latency to every simple case |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | Primary investigator for straightforward tickets | Good speed/quality balance for simple evidence (short complaint, no Bangla, ≤1 txn) |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview` | Investigator for complex tickets | Better reasoning for ambiguous matches, multilingual text, merchant/agent cases |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview` | Offline evaluation judge (`evaluation/gemini-evaluator.ts`) | Structured comparison of actual vs expected outputs during dev testing |

**Configuration:** `src/utils/models.ts`

- Set `OPENROUTER_API_KEY` to enable LLM investigation and the optional input guardrail.
- Set `ENABLE_LLM_GUARDRAIL=false` to force rules-only input checks (used in tests).
- Temperature `0` across all calls for reproducibility. Token limits are capped (256–1536) to control cost and latency.

**Cost reasoning:** Flash Lite handles cheap pre-screening; Flash covers the majority of tickets at lower cost; Pro is reserved for cases where evidence reasoning is hardest. No LLM credits are provided by organizers.

**Without an API key:** the service still runs using the rule-based fallback — useful for schema/health checks and CI, but LLM quality is higher for hidden cases.

---

## Safety logic

Safety is enforced at multiple layers, aligned with the [evaluation rubric](docs/problem-statement.md#8-safety-rules) penalties:

| Rule | Implementation |
|------|----------------|
| Never ask for PIN, OTP, password, or card number | Prompt instructions; regex stripping in `ticket-investigator.safety.ts`; automatic PIN/OTP warning appended to `customer_reply` |
| Never promise refund, reversal, or unblock | Prompt instructions; regex replacement with “any eligible amount will be returned through official channels” |
| Never direct to suspicious third parties | Regex replacement with “official support channels” |
| Ignore prompt injection in complaints | Input guardrails (`injection-patterns.ts`, optional LLM gate); returns `422` for blocked input |
| Escalate risky/ambiguous cases | `human_review_required` set by prompt + rules for disputes, fraud, inconsistent evidence, high severity |
| Bangla replies | Rules generate Bangla `customer_reply` when `language=bn`; safety layer backfills Bangla if LLM returns English-only |

Structural guardrails ensure `relevant_transaction_id` is always `null` when the ID is not in the provided history, and downgrade `evidence_verdict` to `insufficient_data` in that case.

Automated safety checks live in `src/routes/analyze-ticket/test-assertions.ts` (credential solicitation, unauthorized refund language, Bangla reply when requested).

---

## Environment variables

See [`.env.example`](.env.example):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | For LLM path | — | OpenRouter API key |
| `PORT` | No | `8000` (local), `3001` (Docker) | HTTP port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `ENABLE_LLM_GUARDRAIL` | No | `true` | LLM-based input gate on complaints |
| `APP_VERSION` | No | `0.1.0` | App version (health metadata) |
| `NODE_ENV` | No | `development` | `production` in Docker |

---

## Testing

```bash
bun test                                    # unit + integration (no API key needed)
bun run test:live-llm                       # all 10 sample cases via live LLM (needs key)
bun run start &                             # in another terminal:
bun run eval:sample-cases --schema-only     # HTTP + schema check against running server
bun run eval:sample-cases                   # full parallel eval with Gemini Pro judge
```

Tests disable the LLM guardrail by default for speed and determinism. Official sample cases: `src/routes/analyze-ticket/fixtures/SUST_Preli_Sample_Cases.json`

---

## Project structure

```
index.ts                          # Express app entry + /health, /analyze-ticket
src/
  config/env.ts                   # PORT, OPENROUTER_API_KEY, guardrail toggle
  middleware/                     # rate limit, JSON content-type, errors
  routes/analyze-ticket/
    analyze-ticket.controller.ts  # pipeline orchestration
    analyze-ticket.schema.ts    # Zod input/output + types
    ticket-investigator.ts      # Layer 2 — main investigator entry
    ticket-investigator.agent.ts # LLM + rules orchestration
    ticket-investigator.llm.ts    # structured LLM investigation
    ticket-investigator.rules.ts  # Layer 2 — rule-based fallback
    ticket-investigator.safety.ts # output safety post-processing
    fixtures/                     # official sample case pack
docs/
  problem-statement.md            # full hackathon spec
  sample-output.json              # worked SAMPLE-01 request/response
```

---

## Assumptions

- All complaints and transaction histories are **synthetic**; no real payment system integration.
- The service is an **internal agent copilot**, not an autonomous financial decision maker.
- Counterparty phone numbers use Bangladesh `+880` format; Bengali digits in complaints are normalized.
- `transaction_history` contains 0–5 entries; empty history is valid for phishing-only cases.
- `relevant_transaction_id` must be `null` or an ID present in the request's `transaction_history`.
- Enum values must match the spec exactly (`case_type`, `department`, `evidence_verdict`, etc.).
- Judge harness calls only `/health` and `/analyze-ticket` at the service root (no `/api` prefix).

## Known limitations

- Rule-based fallback covers common patterns but will miss nuanced hidden-case edge cases that the LLM handles better.
- LLM responses may vary in wording; decision fields are constrained by schema + guardrails but not byte-identical to reference outputs.
- Multilingual quality depends on model selection; Bangla is supported but mixed Banglish is less tested.
- Unicode-split or heavily obfuscated injection may bypass regex rules; the optional LLM guardrail helps but is network-dependent.
- No persistent storage, queuing, or multi-ticket batch API — one ticket per request.
- Rate limiting is in-memory per IP; not suitable for multi-instance deploy without a shared store.
- Evaluation Gemini judge adds cost and is intended for development, not production runtime.

---

## Project scripts

| Script | Command |
|--------|---------|
| Start server | `bun run start` |
| Dev (watch) | `bun run dev` |
| Tests | `bun test` |
| Build sample pairs fixture | `bun run build:sample-pairs` |
| Evaluate against running API | `bun run eval:sample-cases` |

---

## Submission checklist

- [x] `GET /health` and `POST /analyze-ticket` implemented
- [x] `package.json` / `bun.lock` dependency lockfile
- [x] `README.md` with setup, stack, AI approach, safety, models, limitations
- [x] `.env.example`
- [x] `docs/sample-output.json` from public sample case `SAMPLE-01`
- [x] Docker runbook (`Dockerfile.bun`, `docker-compose.yml`)
- [ ] Live deployment URL (submit separately)

---

## References

- [Preliminary problem statement](docs/problem-statement.md)
- [Work breakdown & sample case table](docs/initial-json-structure.md)
- Hackathon event: **QueueStorm Investigator** — SUST CSE Carnival 2026, Codex Community Hackathon

---

## License

Private hackathon submission — see repository owner for terms.

*Built for the QueueStorm Investigator preliminary challenge. See [`docs/problem-statement.md`](docs/problem-statement.md) for the full API specification.*
