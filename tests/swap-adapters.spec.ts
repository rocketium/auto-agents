import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import type { ThreadStore } from '../src/ports.js';
import { InMemoryAgentEventBus, InMemoryThreadStore } from '../src/memory.js';
import { MultiAgentOrchestrator } from '../src/orchestrator/multi-agent-orchestrator.js';
import { StaticMetaPlanner } from '../src/planner/static-meta-planner.js';

class DelayedThreadStore implements ThreadStore {
	constructor(private readonly inner: InMemoryThreadStore) {}

	private async pause(): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, 1));
	}

	async createThread(input: { request: string; metadata?: Record<string, unknown>; id?: string }) {
		await this.pause();
		return this.inner.createThread(input);
	}
	async getThread(threadId: string) {
		await this.pause();
		return this.inner.getThread(threadId);
	}
	async updateThreadStatus(threadId: string, status: any, error?: string) {
		await this.pause();
		return this.inner.updateThreadStatus(threadId, status, error);
	}
	async saveTeamPlan(threadId: string, plan: any) {
		await this.pause();
		return this.inner.saveTeamPlan(threadId, plan);
	}
	async getTeamPlan(threadId: string) {
		await this.pause();
		return this.inner.getTeamPlan(threadId);
	}
	async upsertAgentStatus(status: any) {
		await this.pause();
		return this.inner.upsertAgentStatus(status);
	}
	async getAgentStatus(threadId: string, agentId: string) {
		await this.pause();
		return this.inner.getAgentStatus(threadId, agentId);
	}
	async saveAgentOutput(output: any) {
		await this.pause();
		return this.inner.saveAgentOutput(output);
	}
	async getAgentOutputs(threadId: string) {
		await this.pause();
		return this.inner.getAgentOutputs(threadId);
	}
}

function buildOrchestrator(threadStore: ThreadStore, eventBus: InMemoryAgentEventBus) {
	return new MultiAgentOrchestrator({
		threadStore,
		eventBus,
		metaPlanner: new StaticMetaPlanner(),
		modelProvider: {
			async getModel() {
				return {
					async invoke() {
						return new AIMessage({ content: 'COMPLETE: parity' });
					},
				};
			},
		},
		toolProvider: { async getTools() { return []; } },
		promptProvider: { async getSystemPrompt() { return 'prompt'; } },
	});
}

describe('adapter swap parity', () => {
	it('produces successful runs for multiple ThreadStore implementations', async () => {
		const runA = await buildOrchestrator(new InMemoryThreadStore(), new InMemoryAgentEventBus()).run({
			request: 'parity test A',
		});

		const runB = await buildOrchestrator(
			new DelayedThreadStore(new InMemoryThreadStore()),
			new InMemoryAgentEventBus(),
		).run({ request: 'parity test B' });

		expect(runA.success).toBe(true);
		expect(runB.success).toBe(true);
		expect(runA.stats.totalAgents).toBe(runB.stats.totalAgents);
	});
});
