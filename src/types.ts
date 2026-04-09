export type EstimatedComplexity = 'simple' | 'medium' | 'complex';

export type ThreadStatus =
	| 'initializing'
	| 'planning'
	| 'executing'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type AgentExecutionStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'blocked';

export interface AgentSpec {
	id: string;
	name: string;
	role: string;
	kind: string;
	systemPrompt?: string;
	dependencies: string[];
	toolNames: string[];
	tasks: string[];
	metadata?: Record<string, unknown>;
}

export interface TeamPlan {
	agents: AgentSpec[];
	workflow: string;
	estimatedComplexity: EstimatedComplexity;
	metadata?: Record<string, unknown>;
}

export interface ThreadRecord {
	id: string;
	status: ThreadStatus;
	request: string;
	createdAt: string;
	updatedAt: string;
	metadata?: Record<string, unknown>;
}

export interface AgentStatusRecord {
	threadId: string;
	agentId: string;
	agentName: string;
	status: AgentExecutionStatus;
	startedAt?: string;
	completedAt?: string;
	error?: string;
	progress?: number;
	metadata?: Record<string, unknown>;
}

export interface AgentOutputRecord {
	threadId: string;
	agentId: string;
	agentName: string;
	output: unknown;
	artifacts?: Record<string, unknown>;
	metrics?: Record<string, unknown>;
	createdAt: string;
}

export interface AgentEvent {
	threadId: string;
	agentId?: string;
	agentName: string;
	eventType: string;
	payload?: unknown;
	timestamp: string;
	sequence: number;
}

export interface OrchestrationStats {
	totalAgents: number;
	totalEvents: number;
	durationMs: number;
}

export interface OrchestrationResult {
	threadId: string;
	success: boolean;
	output: unknown;
	agentOutputs: Map<string, unknown>;
	events: AgentEvent[];
	stats: OrchestrationStats;
}
