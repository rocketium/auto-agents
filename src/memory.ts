import type { AgentEventBus, ThreadStore } from './ports.js';
import type {
	AgentEvent,
	AgentOutputRecord,
	AgentStatusRecord,
	TeamPlan,
	ThreadRecord,
	ThreadStatus,
} from './types.js';

function nowIso(): string {
	return new Date().toISOString();
}

let sequence = 0;

export class InMemoryThreadStore implements ThreadStore {
	private readonly threads = new Map<string, ThreadRecord>();
	private readonly plans = new Map<string, TeamPlan>();
	private readonly statuses = new Map<string, Map<string, AgentStatusRecord>>();
	private readonly outputs = new Map<string, Map<string, AgentOutputRecord>>();

	async createThread(input: {
		request: string;
		metadata?: Record<string, unknown>;
		id?: string;
	}): Promise<ThreadRecord> {
		const id = input.id ?? `th_${Math.random().toString(36).slice(2)}`;
		const timestamp = nowIso();
		const record: ThreadRecord = {
			id,
			status: 'initializing',
			request: input.request,
			createdAt: timestamp,
			updatedAt: timestamp,
			metadata: input.metadata,
		};
		this.threads.set(id, record);
		this.statuses.set(id, new Map());
		this.outputs.set(id, new Map());
		return record;
	}

	async getThread(threadId: string): Promise<ThreadRecord | null> {
		return this.threads.get(threadId) ?? null;
	}

	async updateThreadStatus(threadId: string, status: ThreadStatus, error?: string): Promise<void> {
		const record = this.threads.get(threadId);
		if (!record) return;
		this.threads.set(threadId, {
			...record,
			status,
			updatedAt: nowIso(),
			metadata: error ? { ...(record.metadata ?? {}), error } : record.metadata,
		});
	}

	async saveTeamPlan(threadId: string, plan: TeamPlan): Promise<void> {
		this.plans.set(threadId, plan);
	}

	async getTeamPlan(threadId: string): Promise<TeamPlan | null> {
		return this.plans.get(threadId) ?? null;
	}

	async upsertAgentStatus(status: AgentStatusRecord): Promise<void> {
		const perThread = this.statuses.get(status.threadId) ?? new Map<string, AgentStatusRecord>();
		perThread.set(status.agentId, status);
		this.statuses.set(status.threadId, perThread);
	}

	async getAgentStatus(threadId: string, agentId: string): Promise<AgentStatusRecord | null> {
		const perThread = this.statuses.get(threadId);
		if (!perThread) return null;
		return perThread.get(agentId) ?? null;
	}

	async saveAgentOutput(output: AgentOutputRecord): Promise<void> {
		const perThread = this.outputs.get(output.threadId) ?? new Map<string, AgentOutputRecord>();
		perThread.set(output.agentId, output);
		this.outputs.set(output.threadId, perThread);
	}

	async getAgentOutputs(threadId: string): Promise<Map<string, AgentOutputRecord>> {
		const perThread = this.outputs.get(threadId);
		return new Map(perThread ?? []);
	}
}

export class InMemoryAgentEventBus implements AgentEventBus {
	private readonly events: AgentEvent[] = [];

	async append(event: Omit<AgentEvent, 'timestamp' | 'sequence'>): Promise<void> {
		sequence += 1;
		this.events.push({
			...event,
			timestamp: nowIso(),
			sequence,
		});
	}

	async list(threadId: string): Promise<AgentEvent[]> {
		return this.events.filter(event => event.threadId === threadId);
	}
}
