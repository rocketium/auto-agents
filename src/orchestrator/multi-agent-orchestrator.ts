import type {
	AgentExecutorFactory,
	CompletionStrategy,
	MetaPlanner,
	ModelProvider,
	OrchestratorHooks,
	PromptProvider,
	ThreadStore,
	ToolProvider,
} from '../ports.js';
import { KeywordCompletionStrategy, LangGraphAgentExecutor } from '../executor/langgraph-agent-executor.js';
import type { AgentEvent, OrchestrationResult, TeamPlan } from '../types.js';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export interface MultiAgentOrchestratorOptions {
	threadStore: ThreadStore;
	eventBus: {
		append(event: {
			threadId: string;
			agentId?: string;
			agentName: string;
			eventType: string;
			payload?: unknown;
		}): Promise<void>;
		list(threadId: string): Promise<AgentEvent[]>;
	};
	metaPlanner: MetaPlanner;
	modelProvider: ModelProvider;
	toolProvider: ToolProvider;
	promptProvider: PromptProvider;
	completionStrategy?: CompletionStrategy;
	executorFactory?: AgentExecutorFactory;
	maxIterations?: number;
	dependencyTimeoutMs?: number;
	hooks?: OrchestratorHooks;
}

export interface RunRequest {
	request: string;
	threadId?: string;
	metadata?: Record<string, unknown>;
	finalAgentId?: string;
}

export class MultiAgentOrchestrator {
	private readonly completionStrategy: CompletionStrategy;
	private readonly maxIterations: number;
	private readonly dependencyTimeoutMs: number;

	constructor(private readonly options: MultiAgentOrchestratorOptions) {
		this.completionStrategy = options.completionStrategy ?? new KeywordCompletionStrategy('COMPLETE');
		this.maxIterations = options.maxIterations ?? 6;
		this.dependencyTimeoutMs = options.dependencyTimeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async run(input: RunRequest): Promise<OrchestrationResult> {
		const startedAt = Date.now();
		const thread = await this.options.threadStore.createThread({
			id: input.threadId,
			request: input.request,
			metadata: input.metadata,
		});

		await this.options.threadStore.updateThreadStatus(thread.id, 'planning');
		await this.options.eventBus.append({
			threadId: thread.id,
			agentName: 'orchestrator',
			eventType: 'thread.planning_started',
		});

		const teamPlan = await this.options.metaPlanner.plan({
			threadId: thread.id,
			request: input.request,
			metadata: input.metadata,
		});
		this.ensurePlanIsValid(teamPlan);
		await this.options.threadStore.saveTeamPlan(thread.id, teamPlan);

		for (const agent of teamPlan.agents) {
			await this.options.threadStore.upsertAgentStatus({
				threadId: thread.id,
				agentId: agent.id,
				agentName: agent.name,
				status: agent.dependencies.length === 0 ? 'waiting' : 'blocked',
				progress: 0,
			});
		}

		await this.options.threadStore.updateThreadStatus(thread.id, 'executing');
		await this.options.eventBus.append({
			threadId: thread.id,
			agentName: 'orchestrator',
			eventType: 'thread.execution_started',
			payload: { agentCount: teamPlan.agents.length },
		});

		const executor = this.createExecutor();
		const promises = teamPlan.agents.map(async agent => {
			const result = await executor.execute({
				threadId: thread.id,
				request: input.request,
				agent,
				teamPlan,
			});
			return [agent.id, result] as const;
		});

		const settled = await Promise.allSettled(promises);
		const failures = settled.filter(entry => entry.status === 'rejected');
		const outputs = new Map<string, unknown>();
		for (const item of settled) {
			if (item.status === 'fulfilled') {
				outputs.set(item.value[0], item.value[1]);
			}
		}

		const success = failures.length === 0;
		if (!success) {
			await this.options.threadStore.updateThreadStatus(thread.id, 'failed', String(failures[0]?.reason));
			await this.options.eventBus.append({
				threadId: thread.id,
				agentName: 'orchestrator',
				eventType: 'thread.failed',
				payload: { failures: failures.length },
			});
		} else {
			await this.options.threadStore.updateThreadStatus(thread.id, 'completed');
			await this.options.eventBus.append({
				threadId: thread.id,
				agentName: 'orchestrator',
				eventType: 'thread.completed',
			});
		}

		const events = await this.options.eventBus.list(thread.id);
		for (const event of events) {
			await this.options.hooks?.onAgentEvent?.(event);
		}

		const finalAgentId = input.finalAgentId ?? this.pickFinalAgent(teamPlan);
		const finalOutput = outputs.get(finalAgentId) ?? Object.fromEntries(outputs.entries());

		const result: OrchestrationResult = {
			threadId: thread.id,
			success,
			output: finalOutput,
			agentOutputs: outputs,
			events,
			stats: {
				totalAgents: teamPlan.agents.length,
				totalEvents: events.length,
				durationMs: Date.now() - startedAt,
			},
		};

		await this.options.hooks?.onThreadComplete?.(result);
		if (!success) {
			throw new Error(`Orchestration failed for thread ${thread.id}`);
		}
		return result;
	}

	private createExecutor() {
		if (this.options.executorFactory) {
			return this.options.executorFactory({
				threadStore: this.options.threadStore,
				eventBus: this.options.eventBus,
				modelProvider: this.options.modelProvider,
				toolProvider: this.options.toolProvider,
				promptProvider: this.options.promptProvider,
				completionStrategy: this.completionStrategy,
				maxIterations: this.maxIterations,
				dependencyTimeoutMs: this.dependencyTimeoutMs,
			});
		}

		return new LangGraphAgentExecutor({
			threadStore: this.options.threadStore,
			eventBus: this.options.eventBus,
			modelProvider: this.options.modelProvider,
			toolProvider: this.options.toolProvider,
			promptProvider: this.options.promptProvider,
			completionStrategy: this.completionStrategy,
			maxIterations: this.maxIterations,
			dependencyTimeoutMs: this.dependencyTimeoutMs,
		});
	}

	private ensurePlanIsValid(teamPlan: TeamPlan): void {
		if (teamPlan.agents.length === 0) {
			throw new Error('Meta planner returned empty agent list');
		}

		const ids = new Set(teamPlan.agents.map(agent => agent.id));
		for (const agent of teamPlan.agents) {
			for (const dependency of agent.dependencies) {
				if (!ids.has(dependency)) {
					throw new Error(`Agent ${agent.id} depends on unknown agent ${dependency}`);
				}
			}
		}
	}

	private pickFinalAgent(teamPlan: TeamPlan): string {
		const manager = teamPlan.agents.find(agent =>
			/(manager|lead|reviewer|final)/i.test(`${agent.name} ${agent.role}`),
		);
		const fallback = teamPlan.agents.at(-1);
		if (!fallback) throw new Error('No agents available for final output selection');
		return manager?.id ?? fallback.id;
	}
}
