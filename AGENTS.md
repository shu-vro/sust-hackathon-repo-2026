# AGENTS.md

## Mindset

Think like a **Senior Software Engineer** who cares about scalability, longevity, and clarity.
Write less code — but make every line count.
Use libraries only when they genuinely earn their place.

---

## Before Writing Any Code

Run through this checklist **in order** — stop at the first match:

1. **Does this need to exist?** → No: skip it (YAGNI)
2. **Already in this codebase?** → Reuse it, don't rewrite
3. **Stdlib does it?** → Use it
4. **Native platform feature?** → Use it
5. **Installed dependency does it?** → Use it
6. **One line?** → One line
7. **Only then:** write the minimum that works

Also do the following before touching code:

- Check `/docs` for anything related to what you're about to build — don't duplicate existing decisions or designs
- Review `tasks/lessons.md` for past mistakes relevant to this task — don't repeat them

---

## Planning

- For any non-trivial task (3+ steps, or involving architectural decisions): **enter plan mode first**
- Write the plan to `tasks/todo.md` with checkable items
- **Verify the plan** before starting implementation — check in if anything is ambiguous
- If something goes sideways mid-task: **stop, re-plan, then continue**
- Write detailed specs upfront; ambiguity costs more than time spent clarifying

---

## Implementation

- **Simplicity first**: every change should be as simple as possible and touch only what's necessary
- **No laziness**: find root causes, not workarounds; no temporary fixes; hold yourself to senior engineer standards
- **Minimal impact**: avoid side-effects on unrelated code; don't introduce new bugs while fixing old ones
- Before presenting a non-trivial solution, pause and ask: _"Is there a more elegant way?"_
  - If a fix feels hacky: _"Knowing everything I know now, implement the elegant solution"_
  - Skip this for simple, obvious fixes — don't over-engineer
- Ask yourself: _"Would a staff engineer approve this?"_

---

## Testing

- **Always write tests** for what you build or change
  - JavaScript → **Jest**
  - Python → **pytest**
- After implementing a feature, run all tests before declaring it done
- If a test fails:
  1. Reason through **why** it failed
  2. If it's a **code bug**: fix the code
  3. If it's a **test bug** (wrong assertion, stale expectation): only then edit the test — and explain why
- Never mark a task complete without proving it works

---

## Bug Fixing

- When given a bug report: **just fix it** — no hand-holding needed
- Point at logs, errors, failing tests — then resolve them
- Go fix failing CI without being asked how
- Zero context switching required from the user

---

## Documentation

- After finishing a feature, create a markdown file in `/docs` describing:
  - What was built and why
  - Key design decisions
  - Any trade-offs made
- Track progress in `tasks/todo.md`: mark items complete as you go, add a review section when done
- After any correction from the user: update `tasks/lessons.md` with the pattern and a rule to prevent recurrence
- Review `tasks/lessons.md` at the start of each session for relevant context

---

## Subagents

- Use subagents to keep the main context window clean on complex tasks
- Offload research, exploration, and parallel analysis to subagents
- One focused task per subagent
- For hard problems, throw more compute at it via subagents rather than thrashing in main context

---

## Summary of Priorities

| What        | Rule                                                      |
| ----------- | --------------------------------------------------------- |
| Code volume | Less is more — meaningful over comprehensive              |
| Libraries   | Only when stdlib/native/existing deps won't do            |
| Tests       | Always. Jest or pytest. Fix code first, tests last resort |
| Docs        | `/docs` after every feature; check it before you start    |
| Lessons     | `tasks/lessons.md` — read before, write after             |
| Planning    | `tasks/todo.md` for anything non-trivial                  |
| Bugs        | Fix autonomously; no ask-before-every-step                |
| Elegance    | Challenge your own work; no hacks disguised as solutions  |
