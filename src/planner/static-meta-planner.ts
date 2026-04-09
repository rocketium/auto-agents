import type { MetaPlanner, MetaPlannerContext } from '../ports.js';
import type { TeamPlan } from '../types.js';

/**
 * Fast fallback planner for local testing and onboarding.
 * Produces a deterministic team without requiring model credentials.
 */
export class StaticMetaPlanner implements MetaPlanner {
	async plan(context: MetaPlannerContext): Promise<TeamPlan> {
		return {
			estimatedComplexity: context.request.length > 400 ? 'complex' : 'medium',
			workflow:
				'analyst gathers context -> implementer executes -> manager consolidates final response',
			agents: [
				{
					id: 'analyst',
					name: 'analyst',
					role: 'Research the request and provide actionable context',
					kind: 'research',
					dependencies: [],
					toolNames: [],
					tasks: [
						'Summarize key requirements from the user request',
						'Identify dependencies and constraints',
					],
				},
				{
					id: 'implementer',
					name: 'implementer',
					role: 'Implement a concrete solution based on analyst context',
					kind: 'execution',
					dependencies: ['analyst'],
					toolNames: [],
					tasks: ['Propose and execute the best implementation path'],
				},
				{
					id: 'manager',
					name: 'manager',
					role: 'Produce final consolidated answer and decisions',
					kind: 'reporting',
					dependencies: ['analyst', 'implementer'],
					toolNames: [],
					tasks: ['Merge all agent outputs and produce final response'],
				},
			],
		};
	}
}
