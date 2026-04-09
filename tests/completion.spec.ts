import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { LangGraphAgentExecutor } from '../src/executor/langgraph-agent-executor.js';
import { InMemoryAgentEventBus, InMemoryThreadStore } from '../src/memory.js';

describe('LangGraphAgentExecutor completion strategy', () => {
	it('stops when custom strategy marks complete', async () => {
		const threadStore = new InMemoryThreadStore();
		const eventBus = new InMemoryAgentEventBus();
		const thread = await threadStore.createThread({ request: 'x' });

		await threadStore.upsertAgentStatus({
			threadId: thread.id,
			agentId: 'solo',
			agentName: 'solo',
			status: 'waiting',
		});

		const executor = new LangGraphAgentExecutor({
			threadStore,
			eventBus,
			modelProvider: {
				async getModel() {
					return {
						async invoke() {
							return new AIMessage({ content: 'single pass' });
						},
					};
				},
			},
			toolProvider: { async getTools() { return []; } },
			promptProvider: { async getSystemPrompt() { return 'prompt'; } },
			completionStrategy: {
				async isComplete(context) {
					return { done: context.iteration >= 1, reason: 'single iteration limit' };
				},
			},
			maxIterations: 10,
			dependencyTimeoutMs: 2000,
		});

		const output = await executor.execute({
			threadId: thread.id,
			request: 'test',
			agent: {
				id: 'solo',
				name: 'solo',
				role: 'test role',
				kind: 'chat',
				systemPrompt: 'prompt',
				dependencies: [],
				toolNames: [],
				tasks: ['do work'],
			},
			teamPlan: {
				estimatedComplexity: 'simple',
				workflow: 'single',
				agents: [],
			},
		});

		expect(String(output)).toContain('single pass');
		const status = await threadStore.getAgentStatus(thread.id, 'solo');
		expect(status?.status).toBe('completed');
	});
});
