export function extractFirstJsonObject(text: string): string {
	const start = text.indexOf('{');
	if (start < 0) {
		throw new Error('No JSON object start found in model output');
	}

	let depth = 0;
	for (let i = start; i < text.length; i += 1) {
		const char = text[i];
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return text.slice(start, i + 1);
			}
		}
	}

	throw new Error('No balanced JSON object found in model output');
}

export function contentToString(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map(item => {
				if (typeof item === 'string') return item;
				if (item && typeof item === 'object' && 'text' in item) {
					const text = (item as { text?: unknown }).text;
					return typeof text === 'string' ? text : '';
				}
				return '';
			})
			.join('\n');
	}
	return String(content ?? '');
}
