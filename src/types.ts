/**
 * Portable agent specification for orchestration.
 * Integrators map `kind` to their own configs, prompts, and tool registries.
 */
export interface AgentSpec {
	name: string;
	role: string;
	/** Integrator-defined label (e.g. YAML profile id, graph name, or preset). */
	kind: string;
	responsibilities: string[];
	tools: string[];
	dependencies: string[];
	successCriteria: string[];
	tasks: string[];
}

export type EstimatedComplexity = "simple" | "medium" | "complex";

/**
 * Output of a meta-planner: who runs, in what shape, and high-level workflow notes.
 */
export interface TeamPlan {
	agents: AgentSpec[];
	workflow: string;
	estimatedComplexity: EstimatedComplexity;
}

export type ThreadStatus =
	| "initializing"
	| "planning"
	| "executing"
	| "completed"
	| "failed"
	| "cancelled";

export interface ThreadRecord {
	id: string;
	status: ThreadStatus;
	request: string;
	createdAt: string;
	metadata?: Record<string, unknown>;
}

/** Structured event for streaming, audit, or analytics. */
export interface AgentEvent {
	threadId: string;
	agentName: string;
	eventType: string;
	payload?: unknown;
	timestamp: string;
	sequence: number;
}
