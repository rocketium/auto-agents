# auto-agents

Standalone open-source multi-agent orchestration with LangGraph executors and pluggable adapters.

## Why this package

`auto-agents` gives you a reusable runtime for:

- meta-planning (`MetaPlanner`)
- dependency-aware parallel agent execution (`MultiAgentOrchestrator` + `LangGraphAgentExecutor`)
- swappable persistence (`ThreadStore`)
- swappable event streaming (`AgentEventBus`)
- swappable tools/model/prompt providers

No host-app imports, no framework lock-in.

## Install

```bash
npm install auto-agents @langchain/langgraph @langchain/core zod
# optional default Anthropic integrations
npm install @langchain/anthropic
```

## 5-minute quickstart: run an agent runtime locally

Create `quickstart.mjs`:

```js
import { AIMessage } from '@langchain/core/messages';
import {
	InMemoryAgentEventBus,
	InMemoryThreadStore,
	MultiAgentOrchestrator,
	StaticMetaPlanner,
} from 'auto-agents';

const threadStore = new InMemoryThreadStore();
const eventBus = new InMemoryAgentEventBus();

const modelProvider = {
	async getModel() {
		return {
			async invoke() {
				return new AIMessage({ content: 'COMPLETE: local runtime success' });
			},
		};
	},
};

const toolProvider = {
	async getTools() {
		return [];
	},
};

const promptProvider = {
	async getSystemPrompt(ctx) {
		return `You are ${ctx.agent.name}. Finish your assigned task.`;
	},
};

const orchestrator = new MultiAgentOrchestrator({
	threadStore,
	eventBus,
	metaPlanner: new StaticMetaPlanner(),
	modelProvider,
	toolProvider,
	promptProvider,
});

const result = await orchestrator.run({
	request: 'Draft a launch checklist for an internal tool migration.',
});

console.log('thread:', result.threadId);
console.log('success:', result.success);
console.log('output:', result.output);
console.log('events:', result.events.length);
```

Run it:

```bash
node quickstart.mjs
```

## Local agent team in minutes (2-3 agents)

Use `StaticMetaPlanner`, which creates a local team (`analyst -> implementer -> manager`) and runs with dependency ordering by default.

You can replace planner and wiring incrementally:

```ts
import {
	JsonSchemaMetaPlanner,
	MultiAgentOrchestrator,
	InMemoryThreadStore,
	InMemoryAgentEventBus,
} from 'auto-agents';

const planner = new JsonSchemaMetaPlanner(yourModel);

const orchestrator = new MultiAgentOrchestrator({
	threadStore: new InMemoryThreadStore(),
	eventBus: new InMemoryAgentEventBus(),
	metaPlanner: planner,
	modelProvider,
	toolProvider,
	promptProvider,
});
```

## Build your own runtime with adapters

### ThreadStore

```ts
const threadStore = {
	createThread: async input => ({
		id: input.id ?? crypto.randomUUID(),
		status: 'initializing',
		request: input.request,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}),
	getThread: async threadId => null,
	updateThreadStatus: async (threadId, status) => {},
	saveTeamPlan: async (threadId, plan) => {},
	getTeamPlan: async threadId => null,
	upsertAgentStatus: async status => {},
	getAgentStatus: async (threadId, agentId) => null,
	saveAgentOutput: async output => {},
	getAgentOutputs: async threadId => new Map(),
};
```

### AgentEventBus

```ts
const eventBus = {
	append: async event => {},
	list: async threadId => [],
};
```

### MetaPlanner

```ts
const metaPlanner = {
	plan: async ({ threadId, request }) => ({
		estimatedComplexity: 'simple',
		workflow: 'single agent then manager',
		agents: [
			{
				id: 'manager',
				name: 'manager',
				role: 'final answer',
				kind: 'chat',
				dependencies: [],
				toolNames: [],
				tasks: ['Answer user request'],
			},
		],
	}),
};
```

## Decoupling guarantees

- package code has no host app imports (`@/`, app routes, app aliases)
- all infra connections pass through ports (`ThreadStore`, `AgentEventBus`, `MetaPlanner`)
- swap tests run same orchestrator with different adapters
- boundary checks run in CI before publish

## Troubleshooting

- `ANTHROPIC_API_KEY is required`: set env var before using model-backed planner helpers.
- agent stuck in dependencies: ensure dependency IDs match `AgentSpec.id` exactly.
- no tools called: verify tool names in `AgentSpec.toolNames` and registration in `toolProvider`.
- empty output: ensure model responses include content and completion strategy can terminate.

## License

MIT
