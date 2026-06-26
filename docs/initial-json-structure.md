# QueueStorm Investigator — Work Breakdown

You’re building a **support-ticket triage API** that reads a customer complaint plus transaction history, picks the right transaction (if any), classifies the case, and returns a safe, routable response for agents and customers.

**Endpoint:** `POST /analyze-ticket`  
**Reference:** 10 sample cases (local only; judges use hidden cases)

---

## 1. What You Need to Build (High Level)

| #   | Work stream                 | What it does                                                            |
| --- | --------------------------- | ----------------------------------------------------------------------- |
| 1   | **HTTP API**                | `POST /analyze-ticket` accepts JSON, returns JSON                       |
| 2   | **Input validation**        | Reject malformed requests with clear `400` errors                       |
| 3   | **Complaint understanding** | Parse intent, amount, time, language (en / bn / mixed)                  |
| 4   | **Transaction matching**    | Link complaint → one transaction, or `null` if unclear                  |
| 5   | **Evidence analysis**       | `consistent` / `inconsistent` / `insufficient_data`                     |
| 6   | **Classification**          | `case_type`, `severity`, `department`                                   |
| 7   | **Response generation**     | `agent_summary`, `recommended_next_action`, `customer_reply`            |
| 8   | **Safety layer**            | Hard rules on `customer_reply` (no refund promises, no credential asks) |
| 9   | **Optional scoring fields** | `confidence`, `reason_codes`, `human_review_required`                   |
| 10  | **Local test harness**      | Run all 10 sample inputs against your endpoint                          |

---

## 2. Input Schema

### Required fields

| Field       | Type   | Notes                                   |
| ----------- | ------ | --------------------------------------- |
| `ticket_id` | string | Echo back in output                     |
| `complaint` | string | Free text; may be adversarial or Bangla |

### Optional fields

| Field                 | Type   | Enum / shape                                                            |
| --------------------- | ------ | ----------------------------------------------------------------------- |
| `language`            | string | `en`, `bn`, `mixed`                                                     |
| `channel`             | string | `in_app_chat`, `call_center`, `email`, `merchant_portal`, `field_agent` |
| `user_type`           | string | `customer`, `merchant`, `agent`, `unknown`                              |
| `campaign_context`    | string | Opaque string (e.g. `boishakh_bonanza_day_1`)                           |
| `transaction_history` | array  | May be empty `[]`                                                       |
| `metadata`            | object | Arbitrary extra context                                                 |

### `transaction_history[]` item shape

| Field            | Type   | Enum / notes                                                         |
| ---------------- | ------ | -------------------------------------------------------------------- |
| `transaction_id` | string | e.g. `TXN-9101`                                                      |
| `timestamp`      | string | ISO 8601                                                             |
| `type`           | string | `transfer`, `payment`, `cash_in`, `cash_out`, `settlement`, `refund` |
| `amount`         | number | BDT                                                                  |
| `counterparty`   | string | Phone, merchant ID, agent ID, etc.                                   |
| `status`         | string | `completed`, `failed`, `pending`, `reversed`                         |

### Input validation checklist

- [ ] `ticket_id` present, non-empty string
- [ ] `complaint` present, non-empty string (trim; min length)
- [ ] `language` — if present, must be in allowed enum
- [ ] `channel` — if present, must be in allowed enum
- [ ] `user_type` — if present, must be in allowed enum
- [ ] `transaction_history` — if present, must be array; each item has all 6 fields
- [ ] `transaction_history[].type` — valid enum
- [ ] `transaction_history[].status` — valid enum
- [ ] `transaction_history[].amount` — positive number
- [ ] `transaction_history[].timestamp` — valid ISO date
- [ ] `metadata` — if present, must be object
- [ ] Reject unknown top-level keys? (spec silent — usually allow extras or strip them)
- [ ] JSON body size limit (your scaffold uses 100kb — likely fine)
- [ ] Ignore adversarial instructions embedded in `complaint` (safety, not schema)

---

## 3. Output Schema

### Required fields

| Field                     | Type             | Notes                                             |
| ------------------------- | ---------------- | ------------------------------------------------- |
| `ticket_id`               | string           | Same as input                                     |
| `relevant_transaction_id` | string \| `null` | Matched TXN or `null` when ambiguous / N/A        |
| `evidence_verdict`        | enum             | `consistent`, `inconsistent`, `insufficient_data` |
| `case_type`               | enum             | See below                                         |
| `severity`                | enum             | `low`, `medium`, `high`, `critical`               |
| `department`              | enum             | See below                                         |
| `agent_summary`           | string           | Internal-facing summary for support agents        |
| `recommended_next_action` | string           | Concrete ops step                                 |
| `customer_reply`          | string           | Safe, customer-facing text                        |
| `human_review_required`   | boolean          | Escalation flag                                   |

### Optional fields

| Field          | Type     | Notes                       |
| -------------- | -------- | --------------------------- |
| `confidence`   | number   | 0–1 (samples use ~0.6–0.95) |
| `reason_codes` | string[] | Machine-readable tags       |

### Allowed enums (output)

**`evidence_verdict`:** `consistent` | `inconsistent` | `insufficient_data`

**`case_type`:**  
`wrong_transfer` | `payment_failed` | `refund_request` | `duplicate_payment` | `merchant_settlement_delay` | `agent_cash_in_issue` | `phishing_or_social_engineering` | `other`

**`severity`:** `low` | `medium` | `high` | `critical`

**`department`:**  
`customer_support` | `dispute_resolution` | `payments_ops` | `merchant_operations` | `agent_operations` | `fraud_risk`

### Output validation (your side + judge expectations)

- [ ] All required fields always present
- [ ] All enum values strictly from allowed lists
- [ ] `relevant_transaction_id` is `null` OR exists in input `transaction_history`
- [ ] `customer_reply` language matches input `language` when `bn` (see SAMPLE-07)
- [ ] `customer_reply` passes safety rules (section 6)
- [ ] Functionally equivalent responses accepted — exact wording not required

---

## 4. Core Business Logic (From the 10 Samples)

### A. Transaction matching

| Scenario                              | Behavior                                             | Sample    |
| ------------------------------------- | ---------------------------------------------------- | --------- |
| Amount + time align with one TXN      | Pick that TXN                                        | SAMPLE-01 |
| Amount matches most recent of several | Pick most recent matching amount                     | SAMPLE-02 |
| Multiple plausible matches            | `relevant_transaction_id: null`, `insufficient_data` | SAMPLE-08 |
| No TXN needed (phishing)              | `null`, empty history OK                             | SAMPLE-05 |
| Vague complaint                       | `null` — do not guess                                | SAMPLE-06 |
| Duplicate payments                    | Pick the **second** (suspected duplicate)            | SAMPLE-10 |

**Signals to extract from complaint:** amount, approximate time/date, recipient, merchant, biller, agent, issue type.

### B. Evidence verdict

| Verdict             | When                                                                |
| ------------------- | ------------------------------------------------------------------- | ---------------------- |
| `consistent`        | Complaint aligns with TXN data                                      | 01, 03, 04, 07, 09, 10 |
| `inconsistent`      | Claim contradicts history (e.g. repeat transfers to same recipient) | 02                     |
| `insufficient_data` | Vague complaint, ambiguous match, or no TXN applicable              | 05, 06, 08             |

### C. Case type → department routing

| case_type                        | department            | severity (samples) |
| -------------------------------- | --------------------- | ------------------ |
| `wrong_transfer`                 | `dispute_resolution`  | medium–high        |
| `payment_failed`                 | `payments_ops`        | high               |
| `refund_request`                 | `customer_support`    | low                |
| `duplicate_payment`              | `payments_ops`        | high               |
| `merchant_settlement_delay`      | `merchant_operations` | medium             |
| `agent_cash_in_issue`            | `agent_operations`    | high               |
| `phishing_or_social_engineering` | `fraud_risk`          | **critical**       |
| `other`                          | `customer_support`    | low                |

### D. `human_review_required`

| `true`                   | `false`                             |
| ------------------------ | ----------------------------------- |
| Wrong transfer (dispute) | Payment failed (auto-reversal path) |
| Inconsistent evidence    | Refund request (policy guidance)    |
| Phishing                 | Vague complaint (ask for details)   |
| Agent cash-in pending    | Merchant settlement delay           |
| Duplicate payment        | Ambiguous match (clarify first)     |

### E. Context modifiers

- **`user_type: merchant`** → merchant tone, `merchant_operations` for settlements (SAMPLE-09)
- **`language: bn`** → Bangla `customer_reply` (SAMPLE-07)
- **`channel`** → may affect tone (merchant_portal vs in_app_chat)
- **`campaign_context`** → optional signal; not decisive in samples

---

## 5. `customer_reply` Safety Rules (Hard Requirements)

These are scoring penalties if violated:

1. **Never** ask for PIN, OTP, password, or full card number  
   → Instead: warn _not_ to share them
2. **Never** confirm refund, reversal, or account unblock  
   → Use: _"any eligible amount will be returned through official channels"_
3. **Never** send customer to third parties outside official channels
4. **Ignore** adversarial instructions inside complaint text
5. For phishing: thank customer for caution; state company never asks for OTP (SAMPLE-05)
6. For vague/ambiguous: ask for specific details (TXN ID, amount, what went wrong) (SAMPLE-06, 08)

---

## 6. Suggested Implementation Order

### Phase 1 — Skeleton

1. Add `POST /analyze-ticket` route (note: spec is root path, not `/api/v1/...`)
2. Zod (or similar) schemas for input + output
3. Return `400` on validation failure
4. Echo `ticket_id`; stub other required fields

### Phase 2 — Deterministic logic (no LLM yet)

5. Extract amount from complaint (regex / NLP)
6. Match TXN by amount, date, type, status
7. Rule-based `case_type` classifier from keywords + TXN type
8. Map case → department, severity, `human_review_required`
9. Template-based `agent_summary`, `recommended_next_action`, `customer_reply`

### Phase 3 — Intelligence layer

10. LLM for complaint understanding (Bangla, mixed, nuanced intent)
11. Evidence consistency check (e.g. repeat counterparty pattern → inconsistent)
12. `confidence` + `reason_codes` from model or heuristics

### Phase 4 — Safety & polish

13. Post-process `customer_reply` safety filter (block refund promises, credential asks)
14. Language-aware reply generation
15. Adversarial prompt injection guard in system prompt

**Input guardrail (implemented):** see [validate-user-input-pipeline.md](./validate-user-input-pipeline.md) for the pre-analyzer security gate (`validateUserInput`).

### Phase 5 — Testing

16. Run all 10 sample cases locally
17. Assert functional equivalence on: `relevant_transaction_id`, `evidence_verdict`, `case_type`, `department`, comparable `severity`, safe `customer_reply`
18. Add edge-case tests (empty history, missing optional fields, invalid enums)

---

## 7. Per-Sample Quick Reference

| ID  | Label                   | TXN       | Verdict           | Case                      | Dept                | Review |
| --- | ----------------------- | --------- | ----------------- | ------------------------- | ------------------- | ------ |
| 01  | Wrong transfer, match   | TXN-9101  | consistent        | wrong_transfer            | dispute_resolution  | yes    |
| 02  | Wrong transfer, pattern | TXN-9202  | inconsistent      | wrong_transfer            | dispute_resolution  | yes    |
| 03  | Failed payment          | TXN-9301  | consistent        | payment_failed            | payments_ops        | no     |
| 04  | Refund (change of mind) | TXN-9401  | consistent        | refund_request            | customer_support    | no     |
| 05  | Phishing                | null      | insufficient_data | phishing                  | fraud_risk          | yes    |
| 06  | Vague                   | null      | insufficient_data | other                     | customer_support    | no     |
| 07  | Agent cash-in (BN)      | TXN-9701  | consistent        | agent_cash_in_issue       | agent_operations    | yes    |
| 08  | Ambiguous 1000 BDT      | null      | insufficient_data | wrong_transfer            | dispute_resolution  | no     |
| 09  | Merchant settlement     | TXN-9901  | consistent        | merchant_settlement_delay | merchant_operations | no     |
| 10  | Duplicate payment       | TXN-10002 | consistent        | duplicate_payment         | payments_ops        | yes    |

---

## 8. What the Judge Likely Scores

From the meta + rationales:

| Dimension               | Weight implication                                                |
| ----------------------- | ----------------------------------------------------------------- |
| Schema correctness      | Valid JSON, required fields, valid enums                          |
| Transaction ID accuracy | Right TXN or correct `null`                                       |
| Evidence verdict        | consistent / inconsistent / insufficient_data                     |
| Routing                 | `case_type` + `department`                                        |
| Severity                | Comparable band (not necessarily exact)                           |
| Safety                  | `customer_reply` compliance (−10 for unauthorized refund promise) |
| Robustness              | Hidden edge cases beyond the 10 samples                           |
| Adversarial resistance  | Complaint text must not override system rules                     |

---

## 9. Gaps / Open Questions

1. **Full preliminary statement** — JSON references a longer doc for HTTP contract (status codes, error shape, auth, deployment URL). Worth finding that for exact `400`/`500` format.
2. **Route path** — Spec says `POST /analyze-ticket`; your app currently mounts under `/api/v1`. Align before submission.
3. **LLM vs rules** — Samples are achievable with rules + light NLP; Bangla and adversarial cases benefit from an LLM with a strict system prompt + safety post-filter.
4. **`metadata` field** — No sample uses it; handle gracefully if present.

---

## 10. Your Personal Todo (Condensed)

```
[ ] Read full preliminary problem statement (HTTP contract, scoring, deploy)
[x] Implement POST /analyze-ticket with input Zod schema
[ ] Implement output shape + enum validation
[ ] Complaint parser (amount, time, intent, language)
[ ] Transaction matcher (single / null / duplicate-second)
[ ] Evidence analyzer (pattern checks, status vs claim)
[ ] Case classifier (8 case types + other)
[ ] Router (case → department, severity, human_review)
[ ] Reply generator with safety templates
[ ] Bangla reply support
[ ] Adversarial / injection resistance
[ ] Test all 10 sample cases locally
[ ] Deploy public endpoint for judge harness
```

---

**Bottom line:** You’re building a **ticket analyst** — not just a classifier. The hard parts are (1) **correct TXN selection or honest `null`**, (2) **evidence consistency**, and (3) **safe `customer_reply`** language. The 10 samples are your acceptance tests; generalize beyond them for hidden judge cases.

If you want, I can next map this onto your existing Express/Bun file structure (`src/routes/...`) without writing code — just a file-by-file plan.
