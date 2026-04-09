import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { ChatModelLike, MetaPlanner, MetaPlannerContext } from '../ports.js';
import type { TeamPlan } from '../types.js';
import { contentToString, extractFirstJsonObject } from '../utils/json.js';

const PlanSchema = z.object({
	estimatedComplexity: z.enum(['simple', 'medium', 'complex']),
	workflow: z.string().min(1),
	agents: z
		.array(
			z.object({
				id: z.string().min(1),
				name: z.string().min(1),
				role: z.string().min(1),
				kind: z.string().min(1),
				systemPrompt: z.string().optional(),
				dependencies: z.array(z.string()),
				toolNames: z.array(z.string()),
				tasks: z.array(z.string()),
				metadata: z.record(z.unknown()).optional(),
			})
		)
		.min(1),
	metadata: z.record(z.unknown()).optional(),
});

const DEFAULT_SYSTEM_PROMPT = [
	'You are a meta-planner for a generic multi-agent runtime.',
	'Return only valid JSON with this schema:',
	'{"estimatedComplexity":"simple|medium|complex","workflow":"...","agents":[{"id":"...","name":"...","role":"...","kind":"...","systemPrompt":"optional","dependencies":["..."],"toolNames":["..."],"tasks":["..."]}],"metadata":{}}',
	'Rules:',
	'- Use vendor-neutral names and instructions.',
	'- Ensure dependency graph is acyclic.',
	'- Always include a final manager/reviewer type agent that depends on prior executors when needed.',
].join('\n');

export class JsonSchemaMetaPlanner implements MetaPlanner {
	constructor(
		private readonly model: ChatModelLike,
		private readonly systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
	) {}

	async plan(context: MetaPlannerContext): Promise<TeamPlan> {
		const response = await this.model.invoke([
			new SystemMessage(this.systemPrompt),
			new HumanMessage(`Create a team plan for this request:\n${context.request}`),
		]);

		const raw = contentToString((response as { content?: unknown }).content);
		const json = extractFirstJsonObject(raw);
		const parsed = PlanSchema.parse(JSON.parse(json));
		return parsed;
	}
}

export function createAnthropicPlannerFromEnv(model: ChatModelLike): MetaPlanner {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error('ANTHROPIC_API_KEY is required for JsonSchemaMetaPlanner runtime usage');
	}
	return new JsonSchemaMetaPlanner(model);
}
