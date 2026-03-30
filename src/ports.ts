import type { AgentEvent, TeamPlan, ThreadRecord, ThreadStatus } from "./types.js";

/**
 * Persistence for threads and team plans. Implement with your database.
 */
export interface ThreadStore {
	createThread(input: { request: string; metadata?: Record<string, unknown> }): Promise<ThreadRecord>;
	getThread(threadId: string): Promise<ThreadRecord | null>;
	updateThreadStatus(threadId: string, status: ThreadStatus): Promise<void>;
	saveTeamPlan(threadId: string, plan: TeamPlan): Promise<void>;
	getTeamPlan(threadId: string): Promise<TeamPlan | null>;
}

/**
 * Append-only event sink for agent lifecycle and custom signals.
 */
export interface AgentEventBus {
	append(event: Omit<AgentEvent, "timestamp" | "sequence">): Promise<void>;
}

/**
 * Produces a team plan from the user request.
 */
export interface MetaPlanner {
	plan(userRequest: string): Promise<TeamPlan>;
}
