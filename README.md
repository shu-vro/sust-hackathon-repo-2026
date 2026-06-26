# QueueStorm Investigator

Support-ticket triage API for the **SUST CSE Carnival 2026 · Codex Community Hackathon** (Online Preliminary).

The service reads a customer complaint plus recent transaction history, investigates what happened, classifies the case, routes it to the right department, and drafts a safe customer-facing reply. It is a **copilot for support agents**, not an autonomous financial decision maker.

**Judge-facing endpoints**

| Method | Path              | Purpose                                       |
| ------ | ----------------- | --------------------------------------------- |
| `GET`  | `/health`         | Readiness check — returns `{"status":"ok"}`   |
| `POST` | `/analyze-ticket` | Analyze one ticket and return structured JSON |

---

## Tech stack

| Layer       | Choice                                                  |
| ----------- | ------------------------------------------------------- |
| Runtime     | [Bun](https://bun.sh)                                   |
| HTTP        | Express 5                                               |
| Validation  | Zod 4                                                   |
| Optional AI | LangChain + OpenRouter (`google/gemini-2.5-flash-lite`) |
| Container   | Docker (`Dockerfile.bun`, `docker-compose.yml`)         |

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.14
- Optional: Docker + Docker Compose (for deployment)
- Optional: `OPENROUTER_API_KEY` (for LLM input guardrail on ambiguous complaints)

### Local development

```bash
git clone https://github.com/shu-vro/sust-hackathon-repo-2026.git
cd sust-hackathon
bun install
```

Create a `.env` file in the project root (Bun loads it automatically):

```env
PORT=8000
HOST=0.0.0.0
NODE_ENV=development

# Optional — enables LLM guardrail for ambiguous input
OPENROUTER_API_KEY=your_key_here
ENABLE_LLM_GUARDRAIL=true
```

Start the server:

```bash
bun run dev      # watch mode
# or
bun run start    # production-style
```

Verify:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### Docker

```bash
docker build -f Dockerfile.bun -t sust-hackathon .
docker compose --env-file .env up --build
```

Default container port is **3001** (see `Dockerfile.bun` / `docker-compose.yml`). Map `PORT` in `.env` if you need a different host port.

### Tests

```bash
bun test
# or only the analyze-ticket suite:
bun test src/routes/analyze-ticket
```

Tests disable the LLM guardrail by default for speed and determinism. Live OpenRouter tests run only when `OPENROUTER_API_KEY` is set.

---

## API usage

### `POST /analyze-ticket`

**Headers:** `Content-Type: application/json`

**Minimal request:**

```json
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to a wrong number. Please help me get my money back.",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
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
```

**Success (**`200`**):**

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "...",
  "recommended_next_action": "...",
  "customer_reply": "...",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["wrong_transfer", "transaction_match"]
}
```

**Error responses**

| Code  | When                                                         |
| ----- | ------------------------------------------------------------ |
| `400` | Invalid JSON or Zod schema failure                           |
| `415` | Missing / wrong `Content-Type`                               |
| `422` | Input passed schema but failed security guardrails           |
| `429` | Rate limit exceeded (60 req/min per IP on `/analyze-ticket`) |
| `500` | Unhandled server error (no stack traces in response)         |

Full field definitions and enums: `[docs/problem-statement.md](docs/problem-statement.md)` and `[docs/initial-json-structure.md](docs/initial-json-structure.md)`.

Public sample cases used in tests: `[src/routes/analyze-ticket/sample-cases.fixture.ts](src/routes/analyze-ticket/sample-cases.fixture.ts)`.

---

## Architecture

Processing is split into three layers:

```
POST /analyze-ticket
        │
        ▼
┌─────────────────────────┐
│ 0. Zod request schema   │  400 on invalid shape
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 1. Input guardrail      │  validate-user-input.ts
│    (hard security gate) │  422 if blocked
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 2. Ticket investigator  │  ticket-investigator.ts
│    (complaint + TXN)    │  builds full response
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 3. Output guardrail     │  planned — not yet implemented
│    (soft safety filter) │  post-process customer_reply
└───────────┬─────────────┘
            ▼
     Zod response schema → 200 JSON
```

| Layer                | File(s)                                                               | Responsibility                                                                                         |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **1 — Input**        | `src/utils/validate-user-input.ts`, `src/utils/injection-patterns.ts` | Block prompt injection, credential-harvesting instructions, ultra-vague abuse; sanitize complaint text |
| **2 — Investigator** | `src/routes/analyze-ticket/ticket-investigator.ts`                    | Parse complaint + history → classification, routing, replies                                           |
| **2 — Fallback**     | `src/routes/analyze-ticket/ticket-investigator.rules.ts`              | Rule-based investigator used until Layer 2 is replaced with LLM logic                                  |
| **3 — Output**       | _(planned)_                                                           | Rewrite unsafe `customer_reply` / `recommended_next_action` before responding                          |

Orchestration: `src/routes/analyze-ticket/analyze-ticket.controller.ts`

---

## MODELS (AI usage)

| Model                          | Provider / route              | Where used                                                            | Why                                                                                                                                    |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `google/gemini-2.5-flash-lite` | OpenRouter → Google AI Studio | **Layer 1 only** — optional LLM guardrail in `validate-user-input.ts` | Fast, cheap, low token count; resolves ambiguous injection vs legitimate complaints (e.g. customer reporting a scam that mentions OTP) |
| Rule-based heuristics          | Local (no API)                | **Layer 2** — `ticket-investigator.rules.ts`                          | Deterministic baseline; passes all 10 public sample cases without network latency                                                      |

**Configuration:** `src/utils/models.ts`

- Set `OPENROUTER_API_KEY` to enable the LLM guardrail.
- Set `ENABLE_LLM_GUARDRAIL=false` to force rules-only input checks (used in tests).
- Temperature `0`, `maxTokens` 256 for guardrail calls.
- OpenRouter provider order: `google-ai-studio`, `data_collection: deny`, no fallbacks.

**Layer 2 (investigator)** is designed for LLM upgrade: implement `investigateTicket()` in `ticket-investigator.ts` using the same OpenRouter factory or another provider. The rule-based fallback can be removed once the LLM path is stable.

**Cost note:** No LLM credits are provided by organizers. Guardrail LLM runs only on ambiguous input, not on every ticket.

---

## Safety logic

Safety is enforced at multiple points to match the hackathon rubric (`docs/problem-statement.md` [§8](docs/problem-statement.md)).

### Layer 1 — Input guardrail (implemented)

1. **Sanitization** — strips control characters, normalizes whitespace.
2. **Rule patterns** (`injection-patterns.ts`):

- Prompt injection / system override phrases → block or flag
- Instructions to ask customers for PIN/OTP → block
- Legitimate fintech complaint signals → allow (including Bangla)

1. **Decision logic:**

- Pure injection or harvesting with no legitimate content → **422**
- Injection mixed with a real complaint → **allow** (analyze the ticket)
- Phishing reports that mention OTP in past tense → **allow**

1. **Optional LLM gate** — when rules are ambiguous and `OPENROUTER_API_KEY` is set, Gemini flash-lite classifies injection vs legitimate complaint.

### Layer 2 — Investigator templates (implemented in rules fallback)

The rule-based investigator generates `customer_reply` text that:

- Warns customers **not** to share PIN/OTP (never asks for them)
- Avoids unauthorized refund/reversal promises — uses _"any eligible amount will be returned through official channels"_
- Returns Bangla replies when `language: "bn"`
- Sets `human_review_required` for disputes, fraud, inconsistent evidence, duplicates, agent cash-in

### Layer 3 — Output guardrail (not yet implemented)

A post-processing pass on `customer_reply` and `recommended_next_action` is planned to catch unsafe wording if Layer 2 uses an LLM. Until then, rely on Layer 2 templates and tests in `test-assertions.ts`.

### Automated safety tests

`src/routes/analyze-ticket/test-assertions.ts` checks responses for:

- No credential solicitation patterns
- No unauthorized refund language
- Bangla reply when requested

---

## Project structure

```
index.ts                          # Express app entry + /health, /analyze-ticket
src/
  config/env.ts                   # PORT, OPENROUTER_API_KEY, guardrail toggle
  middleware/                     # rate limit, JSON content-type, errors
  routes/analyze-ticket/
    analyze-ticket.controller.ts  # pipeline orchestration
    analyze-ticket.schema.ts        # Zod input/output + types
    ticket-investigator.ts          # Layer 2 — main investigator entry
    ticket-investigator.rules.ts    # Layer 2 — rule-based fallback
    sample-cases.fixture.ts         # 10 public sample cases
    analyze-ticket.test.ts          # schema + integration tests
  utils/
    validate-user-input.ts          # Layer 1 guardrail
    models.ts                       # OpenRouter / LangChain factory
docs/
  problem-statement.md              # full hackathon spec
  initial-json-structure.md         # work breakdown + sample reference
```

---

## Limitations

These are intentional gaps or known constraints for manual review / finalist scoring:

| Area                     | Limitation                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Investigator**         | Layer 2 uses **rule-based heuristics**, not an LLM. Nuanced Banglish, edge phrasing, and hidden judge cases may be misclassified until `ticket-investigator.ts` is upgraded. |
| **Output safety**        | Layer 3 output guardrail is **not implemented**. An LLM-based investigator could emit unsafe `customer_reply` text without a post-filter.                                    |
| **Input guardrail**      | Unicode-split or heavily obfuscated injection may bypass regex rules (documented in tests). LLM guardrail helps but is optional and network-dependent.                       |
| **Transaction matching** | Ambiguous multi-match scenarios return `relevant_transaction_id: null` — correct per spec, but depends on amount regex and keyword detection.                                |
| **Evidence reasoning**   | “Inconsistent” verdict uses a simple repeat-counterparty heuristic, not full ledger simulation.                                                                              |
| **No persistence**       | Stateless API — no database, ticket store, or audit log.                                                                                                                     |
| **No real payments**     | Synthetic data only; no bKash or production integration.                                                                                                                     |
| **Rate limiting**        | In-memory per-IP limit; not suitable for multi-instance deploy without a shared store.                                                                                       |
| **Response quality**     | `agent_summary` / `customer_reply` are template-driven in the rules path; wording will not match sample outputs word-for-word (judges accept functional equivalence).        |

---

## Assumptions

- Judge harness calls `GET /health` and `POST /analyze-ticket` at the **root** paths (not under `/api/v1`).
- Complaints and transaction histories are **synthetic** evaluation data.
- `relevant_transaction_id` must be `null` or an ID present in the request’s `transaction_history`.
- Enum values must match the spec exactly (`case_type`, `department`, `evidence_verdict`, etc.).

---

## References

- [Preliminary problem statement](docs/problem-statement.md)
- [Work breakdown & sample case table](docs/initial-json-structure.md)
- Hackathon event: **QueueStorm Investigator** — SUST CSE Carnival 2026, Codex Community Hackathon

---

## License

Private hackathon submission — see repository owner for terms.
