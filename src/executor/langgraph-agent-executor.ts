import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type {
	AgentExecutionContext,
	AgentExecutor,
	CompletionStrategy,
	ModelProvider,
	PromptProvider,
	ThreadStore,
	ToolProvider,
} from '../ports.js';
import { contentToString } from '../utils/json.js';

const POLL_INTERVAL_MS = 750;

const ExecutorState = Annotation.Root({
	messages: Annotation<unknown[]>({
		reducer: (x, y) => [...x, ...y],
		default: () => [],
	}),
	iterations: Annotation<number>({
		reducer: (_x, y) => y,
		default: () => 0,
	}),
	aggregatedOutput: Annotation<string>({
		reducer: (_x, y) => y,
		default: () => '',
	}),
	complete: Annotation<boolean>({
		reducer: (_x, y) => y,
		default: () => false,
	}),
	reason: Annotation<string>({
		reducer: (_x, y) => y,
		default: () => '',
	}),
});

type GraphState = typeof ExecutorState.State;

export interface LangGraphExecutorDeps {
	threadStore: ThreadStore;
	eventBus: {
		append(event: {
			threadId: string;
			agentId?: string;
			agentName: string;
			eventType: string;
			payload?: unknown;
		}): Promise<void>;
	};
	modelProvider: ModelProvider;
	toolProvider: ToolProvider;
	promptProvider: PromptProvider;
	completionStrategy: CompletionStrategy;
	maxIterations: number;
	dependencyTimeoutMs: number;
}

export class LangGraphAgentExecutor implements AgentExecutor {
	constructor(private readonly deps: LangGraphExecutorDeps) {}

	async execute(context: AgentExecutionContext): Promise<unknown> {
		await this.waitForDependencies(context);

		await this.deps.threadStore.upsertAgentStatus({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			status: 'running',
			startedAt: new Date().toISOString(),
			progress: 1,
		});
		await this.deps.eventBus.append({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			eventType: 'agent.started',
			payload: { dependencies: context.agent.dependencies },
		});

		const graph = this.buildGraph(context);
		const output = await graph.invoke({
			messages: [],
			iterations: 0,
			aggregatedOutput: '',
			complete: false,
			reason: '',
		} as GraphState);

		const finalOutput = output.aggregatedOutput || 'No output generated';
		await this.deps.threadStore.saveAgentOutput({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			output: finalOutput,
			createdAt: new Date().toISOString(),
		});
		await this.deps.threadStore.upsertAgentStatus({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			status: 'completed',
			startedAt: undefined,
			completedAt: new Date().toISOString(),
			progress: 100,
			metadata: { reason: output.reason || 'completion strategy satisfied' },
		});
		await this.deps.eventBus.append({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			eventType: 'agent.completed',
			payload: { reason: output.reason, iterations: output.iterations },
		});
		return finalOutput;
	}

	private buildGraph(context: AgentExecutionContext) {
		const workflow = new StateGraph(ExecutorState)
			.addNode('execute_step', async (state: GraphState) => this.executeStep(context, state))
			.addConditionalEdges('execute_step', (state: GraphState) => {
				if (state.complete || state.iterations >= this.deps.maxIterations) {
					return 'finish';
				}
				return 'continue';
			}, {
				continue: 'execute_step',
				finish: END,
			})
			.addEdge(START, 'execute_step');

		return workflow.compile();
	}

	private async executeStep(context: AgentExecutionContext, state: GraphState): Promise<GraphState> {
		const model = await this.deps.modelProvider.getModel(context);
		const tools = await this.deps.toolProvider.getTools(context);
		const prompt = await this.getPrompt(context);
		const runnable = tools.length > 0 && model.bindTools ? model.bindTools(tools) : model;

		const modelResponse = await runnable.invoke([
			new SystemMessage(prompt),
			new HumanMessage(this.buildTurnPrompt(context, state.iterations)),
		]);

		const nextMessages: unknown[] = [modelResponse];
		const { toolMessages, toolNames } = await this.runToolsIfAny(tools, modelResponse, context);
		nextMessages.push(...toolMessages);

		const messageText = contentToString((modelResponse as { content?: unknown }).content);
		const aggregated = [state.aggregatedOutput, messageText].filter(Boolean).join('\n\n').trim();
		const completion = await this.deps.completionStrategy.isComplete({
			agent: context.agent,
			iteration: state.iterations + 1,
			lastModelMessage: modelResponse,
			aggregatedOutput: aggregated,
		});

		await this.deps.eventBus.append({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			eventType: 'agent.iteration',
			payload: {
				iteration: state.iterations + 1,
				toolCalls: toolNames,
				complete: completion.done,
				reason: completion.reason,
			},
		});

		return {
			...state,
			messages: nextMessages,
			iterations: state.iterations + 1,
			aggregatedOutput: aggregated,
			complete: completion.done,
			reason: completion.reason ?? '',
		};
	}

	private async getPrompt(context: AgentExecutionContext): Promise<string> {
		if (context.agent.systemPrompt) return context.agent.systemPrompt;
		return this.deps.promptProvider.getSystemPrompt(context);
	}

	private buildTurnPrompt(context: AgentExecutionContext, iteration: number): string {
		if (iteration === 0) {
			return [
				`User request: ${context.request}`,
				`Agent role: ${context.agent.role}`,
				`Tasks: ${context.agent.tasks.join('; ') || 'n/a'}`,
				'Provide concrete output and include COMPLETE when your work is finished.',
			].join('\n');
		}
		return 'Continue from prior context. If done, return COMPLETE with concise final output.';
	}

	private async waitForDependencies(context: AgentExecutionContext): Promise<void> {
		if (context.agent.dependencies.length === 0) return;

		const startedAt = Date.now();
		for (;;) {
			const statuses = await Promise.all(
				context.agent.dependencies.map(dep => this.deps.threadStore.getAgentStatus(context.threadId, dep)),
			);

			if (statuses.some(status => status?.status === 'failed')) {
				const failed = statuses.find(status => status?.status === 'failed');
				throw new Error(`Dependency failed for agent ${context.agent.name}: ${failed?.agentName ?? 'unknown'}`);
			}

			if (statuses.every(status => status?.status === 'completed')) return;

			if (Date.now() - startedAt > this.deps.dependencyTimeoutMs) {
				throw new Error(`Dependency timeout for agent ${context.agent.name}`);
			}

			await sleep(POLL_INTERVAL_MS);
		}
	}

	private async runToolsIfAny(
		tools: DynamicStructuredTool[],
		modelMessage: unknown,
		context: AgentExecutionContext,
	): Promise<{ toolMessages: ToolMessage[]; toolNames: string[] }> {
		const toolCalls = this.extractToolCalls(modelMessage);
		if (toolCalls.length === 0) return { toolMessages: [], toolNames: [] };

		const byName = new Map(tools.map(tool => [tool.name, tool]));
		const toolMessages: ToolMessage[] = [];
		for (const call of toolCalls) {
			const tool = byName.get(call.name);
			if (!tool) {
				toolMessages.push(
					new ToolMessage({
						tool_call_id: call.id,
						name: call.name,
						content: `Tool ${call.name} not registered`,
					}),
				);
				continue;
			}

			const result = await tool.invoke(call.args);
			toolMessages.push(
				new ToolMessage({
					tool_call_id: call.id,
					name: call.name,
					content: typeof result === 'string' ? result : JSON.stringify(result),
				}),
			);
		}

		await this.deps.eventBus.append({
			threadId: context.threadId,
			agentId: context.agent.id,
			agentName: context.agent.name,
			eventType: 'agent.tool_calls',
			payload: toolCalls.map(call => ({ name: call.name })),
		});

		return { toolMessages, toolNames: toolCalls.map(call => call.name) };
	}

	private extractToolCalls(modelMessage: unknown): Array<{ id: string; name: string; args: unknown }> {
		const msg = modelMessage as {
			tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
			additional_kwargs?: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
		};

		if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
			return msg.tool_calls
				.filter(call => call.name)
				.map((call, index) => ({
					id: call.id ?? `tool_${index}`,
					name: call.name ?? 'unknown_tool',
					args: call.args ?? {},
				}));
		}

		const openAiStyleCalls = msg.additional_kwargs?.tool_calls ?? [];
		return openAiStyleCalls
			.filter(call => call.function?.name)
			.map((call, index) => ({
				id: call.id ?? `tool_${index}`,
				name: call.function?.name ?? 'unknown_tool',
				args: safeJsonParse(call.function?.arguments),
			}));
	}
}

export class KeywordCompletionStrategy implements CompletionStrategy {
	constructor(private readonly keyword = 'COMPLETE') {}

	async isComplete(context: {
		agent: { id: string };
		iteration: number;
		lastModelMessage: unknown;
		aggregatedOutput: string;
	}): Promise<{ done: boolean; reason?: string }> {
		if (context.aggregatedOutput.includes(this.keyword)) {
			return { done: true, reason: `${this.keyword} marker found` };
		}
		if (context.iteration >= 3) {
			return { done: true, reason: 'max default iteration reached' };
		}
		return { done: false };
	}
}

function safeJsonParse(input: unknown): unknown {
	if (typeof input !== 'string') return {};
	try {
		return JSON.parse(input);
	} catch {
		return {};
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
