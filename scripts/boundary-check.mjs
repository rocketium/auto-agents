import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SRC_DIR = new URL('../src/', import.meta.url);
const FORBIDDEN = [
	{ pattern: "from '@/", reason: 'Host alias import detected' },
	{ pattern: "from '@/", reason: 'Host alias import detected' },
	{ pattern: '/src/app/', reason: 'Framework route coupling detected' },
	{ pattern: '/rocketium/moat/', reason: 'Host repository path detected' },
	{ pattern: "from 'next/", reason: 'Next.js runtime coupling detected' },
	{ pattern: 'from \"next/', reason: 'Next.js runtime coupling detected' },
];

async function walk(dirUrl) {
	const output = [];
	for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
		const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
		if (entry.isDirectory()) {
			output.push(...(await walk(child)));
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			output.push(child);
		}
	}
	return output;
}

const files = await walk(SRC_DIR);
const violations = [];

for (const fileUrl of files) {
	const content = await readFile(fileUrl, 'utf8');
	for (const rule of FORBIDDEN) {
		if (content.includes(rule.pattern)) {
			violations.push({ file: fileUrl.pathname, reason: rule.reason, pattern: rule.pattern });
		}
	}
}

if (violations.length > 0) {
	console.error('Boundary check failed. Remove host-coupled imports:');
	for (const violation of violations) {
		console.error(`- ${violation.file} -> ${violation.reason} (${violation.pattern})`);
	}
	process.exit(1);
}

console.log(`Boundary check passed for ${files.length} source files.`);
