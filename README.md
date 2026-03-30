# agent-team-orchestrator

Multi-agent orchestration with meta-planning, LangGraph-based executors, and **pluggable** persistence and event streaming.

## Status

Early scaffold: interfaces and reference in-memory implementations. Full orchestrator port from a host application is tracked in the project plan.

## Install

```bash
npm install agent-team-orchestrator @langchain/langgraph @langchain/core zod
# optional default model
npm install @langchain/anthropic
```

## Concepts

- **ThreadStore** — thread lifecycle and team-plan persistence (you implement for your database).
- **AgentEventBus** — append structured events for streaming or audit (you implement).
- **MetaPlanner** — turns a user request into a `TeamPlan` and per-agent specs (use the bundled default or your own).

## License

MIT
