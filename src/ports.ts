import type { BaseMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';

import type {
	AgentEvent,
	AgentOutputRecord,
	AgentSpec,
	AgentStatusRecord,
	OrchestrationResult,
	TeamPlan,
	ThreadRecord,
	ThreadStatus,
} from './types.js';

export interface ThreadStore {
	createThread(input: { request: string; metadata?: Record<string, unknown>; id?: string }): Promise<ThreadRecord>;
	getThread(threadId: string): Promise<ThreadRecord | null>;
	updateThreadStatus(threadId: string, status: ThreadStatus, error?: string): Promise<void>;
	saveTeamPlan(threadId: string, plan: TeamPlan): Promise<void>;
	getTeamPlan(threadId: string): Promise<TeamPlan | null>;
	upsertAgentStatus(status: AgentStatusRecord): Promise<void>;
	getAgentStatus(threadId: string, agentId: string): Promise<AgentStatusRecord | null>;
	saveAgentOutput(output: AgentOutputRecord): Promise<void>;
	getAgentOutputs(threadId: string): Promise<Map<string, AgentOutputRecord>>;
}

export interface AgentEventBus {
	append(event: Omit<AgentEvent, 'timestamp' | 'sequence'>): Promise<void>;
	list(threadId: string): Promise<AgentEvent[]>;
}

export interface MetaPlannerContext {
	threadId: string;
	request: string;
	metadata?: Record<string, unknown>;
}

export interface MetaPlanner {
	plan(context: MetaPlannerContext): Promise<TeamPlan>;
}

export interface ChatModelLike {
	invoke(messages: BaseMessage[]): Promise<unknown>;
	bindTools?(tools: DynamicStructuredTool[]): ChatModelLike;
}

export interface AgentExecutionContext {
	threadId: string;
	request: string;
	agent: AgentSpec;
	teamPlan: TeamPlan;
}

export interface ModelProvider {
	getModel(context: AgentExecutionContext): Promise<ChatModelLike>;
}

export interface ToolProvider {
	getTools(context: AgentExecutionContext): Promise<DynamicStructuredTool[]>;
}

export interface PromptProvider {
	getSystemPrompt(context: AgentExecutionContext): Promise<string>;
}

export interface CompletionContext {
	agent: AgentSpec;
	iteration: number;
	lastModelMessage: unknown;
	aggregatedOutput: string;
}

export interface CompletionStrategy {
	isComplete(context: CompletionContext): Promise<{ done: boolean; reason?: string }>;
}

export interface AgentExecutor {
	execute(context: AgentExecutionContext): Promise<unknown>;
}

export type AgentExecutorFactory = (deps: {
	threadStore: ThreadStore;
	eventBus: AgentEventBus;
	modelProvider: ModelProvider;
	toolProvider: ToolProvider;
	promptProvider: PromptProvider;
	completionStrategy: CompletionStrategy;
	maxIterations: number;
	dependencyTimeoutMs: number;
}) => AgentExecutor;

export interface OrchestratorHooks {
	onAgentEvent?(event: AgentEvent): void | Promise<void>;
	onThreadComplete?(result: OrchestrationResult): void | Promise<void>;
}
