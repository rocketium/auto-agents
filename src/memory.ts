import type { AgentEventBus, ThreadStore } from "./ports.js";
import type { AgentEvent, TeamPlan, ThreadRecord, ThreadStatus } from "./types.js";

function nowIso(): string {
	return new Date().toISOString();
}

let seq = 0;

export class InMemoryThreadStore implements ThreadStore {
	private threads = new Map<string, ThreadRecord>();
	private plans = new Map<string, TeamPlan>();

	async createThread(input: {
		request: string;
		metadata?: Record<string, unknown>;
	}): Promise<ThreadRecord> {
		const id = `th_${crypto.randomUUID?.() ?? String(Math.random()).slice(2)}`;
		const rec: ThreadRecord = {
			id,
			status: "initializing",
			request: input.request,
			createdAt: nowIso(),
			metadata: input.metadata,
		};
		this.threads.set(id, rec);
		return rec;
	}

	async getThread(threadId: string): Promise<ThreadRecord | null> {
		return this.threads.get(threadId) ?? null;
	}

	async updateThreadStatus(threadId: string, status: ThreadStatus): Promise<void> {
		const t = this.threads.get(threadId);
		if (t) this.threads.set(threadId, { ...t, status });
	}

	async saveTeamPlan(threadId: string, plan: TeamPlan): Promise<void> {
		this.plans.set(threadId, plan);
	}

	async getTeamPlan(threadId: string): Promise<TeamPlan | null> {
		return this.plans.get(threadId) ?? null;
	}
}

export class InMemoryAgentEventBus implements AgentEventBus {
	private events: AgentEvent[] = [];

	async append(
		event: Omit<AgentEvent, "timestamp" | "sequence">
	): Promise<void> {
		seq += 1;
		this.events.push({
			...event,
			timestamp: nowIso(),
			sequence: seq,
		});
	}

	/** For tests / demos */
	getEvents(): readonly AgentEvent[] {
		return this.events;
	}
}
