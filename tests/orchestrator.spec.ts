import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { InMemoryAgentEventBus, InMemoryThreadStore } from '../src/memory.js';
import { MultiAgentOrchestrator } from '../src/orchestrator/multi-agent-orchestrator.js';
import { StaticMetaPlanner } from '../src/planner/static-meta-planner.js';

describe('MultiAgentOrchestrator', () => {
	it('runs with in-memory adapters and returns success', async () => {
		const threadStore = new InMemoryThreadStore();
		const eventBus = new InMemoryAgentEventBus();

		const orchestrator = new MultiAgentOrchestrator({
			threadStore,
			eventBus,
			metaPlanner: new StaticMetaPlanner(),
			modelProvider: {
				async getModel(context) {
					return {
						async invoke() {
							return new AIMessage({ content: `COMPLETE: done by ${context.agent.id}` });
						},
					};
				},
			},
			toolProvider: {
				async getTools() {
					return [];
				},
			},
			promptProvider: {
				async getSystemPrompt(context) {
					return `You are ${context.agent.name}`;
				},
			},
		});

		const result = await orchestrator.run({ request: 'Create a lightweight launch checklist' });
		expect(result.success).toBe(true);
		expect(result.stats.totalAgents).toBeGreaterThanOrEqual(3);
		expect(result.events.length).toBeGreaterThan(0);
	});

	it('respects dependency ordering before starting dependents', async () => {
		const threadStore = new InMemoryThreadStore();
		const eventBus = new InMemoryAgentEventBus();

		const orchestrator = new MultiAgentOrchestrator({
			threadStore,
			eventBus,
			metaPlanner: new StaticMetaPlanner(),
			modelProvider: {
				async getModel(context) {
					return {
						async invoke() {
							return new AIMessage({ content: `COMPLETE: ${context.agent.id}` });
						},
					};
				},
			},
			toolProvider: { async getTools() { return []; } },
			promptProvider: { async getSystemPrompt() { return 'Do task'; } },
		});

		const result = await orchestrator.run({ request: 'dependency order check' });
		const events = result.events;
		const analystCompleted = events.findIndex(
			event => event.agentName === 'analyst' && event.eventType === 'agent.completed',
		);
		const implementerStarted = events.findIndex(
			event => event.agentName === 'implementer' && event.eventType === 'agent.started',
		);

		expect(analystCompleted).toBeGreaterThanOrEqual(0);
		expect(implementerStarted).toBeGreaterThanOrEqual(0);
		expect(analystCompleted).toBeLessThan(implementerStarted);
	});
});
