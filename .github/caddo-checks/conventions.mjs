#!/usr/bin/env node
/**
 * Convention checks for the caddo deploy branch of keepprogress/roBrowserLegacy.
 *
 * They encode what upstream review asked of our changes, so the next change
 * does not need the same review comment:
 *
 *  C1  data-background / data-hover / ... are resolved against DB.INTERFACE_PATH
 *      by GUIComponent: the value must not hold it (MrAntares/roBrowserLegacy#1576).
 *  C2  Resource names are looked up in the GRF with the filesystem charset: never
 *      decode them with userCharpage. The table loaders choose the charset with
 *      their useCharPage flag, never with a list of table names
 *      (MrAntares/roBrowserLegacy#1575, docs/Encoding.md).
 *  C3  This fork is public: no private-network address, and none of the
 *      deployment values listed in the CADDO_DENY_PATTERNS secret, in what any
 *      commit of this branch adds on top of upstream (files and messages). A
 *      value removed again is still in history. On CI the secret is required.
 *  C4  The Chinese UI is exactly one "feat(caddo): apply ui_zh" commit, and the
 *      caddo patch exactly one "feat(caddo): apply robrowser-caddo.patch" commit.
 *  C5  A fix or feature without a (caddo) scope is meant for upstream: it comes
 *      with a test it adds or changes (or a "No-Test: <reason>" trailer) and
 *      touches no caddo-only file.
 *
 * C1 and C2 scan the whole tree; C3 to C5 look at the commits since upstream.
 *
 * Usage: node .github/caddo-checks/conventions.mjs [--base <ref>]
 *   --base  upstream ref the branch is built on (default: upstream/master)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA_ATTRS = '(?:background|hover|down|active|preload)';
const DATA_ATTR_NAME = new RegExp(`data-${DATA_ATTRS}|dataset\\.${DATA_ATTRS}|['"]${DATA_ATTRS}['"]`);

const INTERFACE_PATH_IN_DATA_ATTR = [
	// data-background="${DB.INTERFACE_PATH}item/..."
	new RegExp(`data-${DATA_ATTRS}\\s*=\\s*["'\`\\\\]*[^"'\`\\s>]*\\$\\{[^}]*INTERFACE_PATH`),
	// 'data-background="' + DB.INTERFACE_PATH + ...
	new RegExp(`data-${DATA_ATTRS}\\s*=\\s*["'\\\\]*['"\`]\\s*\\+\\s*[\\w.]*INTERFACE_PATH`),
	// node.dataset.background = DB.INTERFACE_PATH + ...
	new RegExp(`\\.dataset\\.${DATA_ATTRS}\\s*=[^;\\n]*INTERFACE_PATH`),
	// setAttribute('data-background', DB.INTERFACE_PATH + ...), $(..).attr / .data(...)
	new RegExp(`(?:setAttribute|\\.attr|\\.data)\\(\\s*['"](?:data-)?${DATA_ATTRS}['"]\\s*,[^)\\n]*INTERFACE_PATH`)
];

/**
 * Source lines joined where a string concatenation continues on the next line
 * (one ends with `+` or the next starts with it), so an expression split over
 * lines is seen whole. Lines are never joined otherwise. Each logical line keeps
 * the number of the line it starts on, and its source lines as parts.
 */
export function logicalLines(text) {
	const out = [];
	text.split(/\r?\n/).forEach((line, i) => {
		const prev = out[out.length - 1];
		if (prev && (/\+\s*$/.test(prev.text) || /^\s*\+/.test(line))) {
			prev.text = `${prev.text.trimEnd()} ${line.trim()}`;
			prev.parts.push({ line: i + 1, text: line });
		} else {
			out.push({ line: i + 1, text: line, parts: [{ line: i + 1, text: line }] });
		}
	});
	return out;
}

/** C1: data-* image attributes holding DB.INTERFACE_PATH. */
export function findInterfacePathInDataAttr(text) {
	return logicalLines(text)
		.filter(l => INTERFACE_PATH_IN_DATA_ATTR.some(re => re.test(l.text)))
		.map(l => ({
			// the source line naming the attribute, which a split expression may not start on
			line: (l.parts.find(p => DATA_ATTR_NAME.test(p.text)) || l).line,
			message:
				'data-* image attributes are resolved against DB.INTERFACE_PATH by GUIComponent: give the path relative to it, or the folder is named twice.'
		}));
}

/** Arguments of the call whose `(` is at open, up to its matching `)`, or null. */
export function callArguments(text, open) {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if ('([{'.includes(text[i])) depth++;
		else if (')]}'.includes(text[i]) && --depth === 0) {
			return text.slice(open + 1, i);
		}
	}
	return null;
}

/** C2a: a resource name decoded with the langtype charset. */
export function findResourceNameUserCharpage(text) {
	const found = [];
	// A decode() call assigned to a resource name is read with balanced
	// parentheses, so nested arguments and line breaks do not hide its charset.
	const assign = /ResourceName\w*\s*(?::|=(?!=))/g;
	for (let m; (m = assign.exec(text));) {
		const rest = text.slice(m.index + m[0].length);
		const call = /^\s*[\w.$?]*\bdecode\s*\(/.exec(rest);
		if (!call) continue;
		const args = callArguments(rest, call[0].length - 1);
		if (args !== null && /\buserCharpage\b/.test(args)) {
			found.push({
				line: text.slice(0, m.index).split('\n').length,
				message:
					'Resource names are used for GRF lookup: decode them with the filesystem charset (grfCharpage), not userCharpage (docs/Encoding.md).'
			});
		}
	}
	return found;
}

/** Body of `function name(` in text, with the line it starts on. */
export function functionBody(text, name) {
	const start = text.search(new RegExp(`function ${name}\\s*\\(`));
	if (start === -1) {
		return null;
	}
	const open = text.indexOf('{', text.indexOf(')', start));
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth === 0) {
			return {
				signature: text.slice(start, open),
				body: text.slice(open, i + 1),
				line: text.slice(0, start).split('\n').length
			};
		}
	}
	return null;
}

/**
 * Default of each loader's useCharPage flag. Callers omit the flag for the common
 * case, so swapping a default silently changes the charset of every such table:
 * loadTable mostly reads resource names, loadLuaTable mostly text (#1575).
 */
export const LOADER_DEFAULTS = { loadTable: 'false', loadLuaTable: 'true' };

/** C2b: the table loaders use userCharpage only through their useCharPage flag, with its usual default. */
export function findLoaderCharset(text) {
	const found = [];
	for (const [name, def] of Object.entries(LOADER_DEFAULTS)) {
		const fn = functionBody(text, name);
		if (!fn) {
			found.push({ line: 1, message: `function ${name}() not found: update the C2 check.` });
			continue;
		}
		if (!new RegExp(`\\buseCharPage\\s*=\\s*${def}\\b`).test(fn.signature)) {
			found.push({
				line: fn.line,
				message: `${name}() must take useCharPage = ${def}: callers that omit it rely on that charset (text tables use the langtype charset, resource names the filesystem charset).`
			});
		}
		const uses = fn.body.match(/userCharpage/g) || [];
		const gated = fn.body.match(/useCharPage\s*\?\s*userCharpage/g) || [];
		if (uses.length !== gated.length) {
			found.push({
				line: fn.line,
				message: `${name}() uses userCharpage without its useCharPage flag: resource names are decoded with the filesystem charset.`
			});
		}
	}
	return found;
}

const PRIVATE_IPV4 =
	/(?<![\d.])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])/;

/** C3: deployment values in a line. denyPatterns are RegExp built from the secret. */
export function findDeployValue(line, denyPatterns) {
	if (PRIVATE_IPV4.test(line)) {
		return 'a private-network address';
	}
	if (denyPatterns.some(re => re.test(line))) {
		return 'a deployment value listed in CADDO_DENY_PATTERNS';
	}
	return null;
}

/**
 * C3 over `git log -p --unified=0` output, one commit at a time: a value added by
 * one commit and removed by a later one is still public in the first.
 * Returns {sha, file, line, what}; the value itself is never returned.
 */
export function findDeployValuesInLog(log, denyPatterns) {
	const found = [];
	let sha = null;
	let file = null;
	let line = 0;
	for (const row of log.split('\n')) {
		const commit = /^commit ([0-9a-f]{7,40})$/.exec(row);
		if (commit) {
			sha = commit[1];
			file = null;
		} else if (row.startsWith('+++ ')) {
			file = row === '+++ /dev/null' ? null : row.slice(6);
		} else if (row.startsWith('@@')) {
			line = Number(/\+(\d+)/.exec(row)[1]);
		} else if (file && row.startsWith('+')) {
			const what = findDeployValue(row.slice(1), denyPatterns);
			if (what) found.push({ sha, file, line, what });
			line++;
		}
	}
	return found;
}

/** Whether a missing CADDO_DENY_PATTERNS fails the run: on CI it does, locally it only warns. */
export function denyPatternsRequired(env) {
	return env.GITHUB_ACTIONS === 'true';
}

export function parseDenyPatterns(secret) {
	return (secret || '')
		.split(/\r?\n/)
		.map(s => s.trim())
		.filter(Boolean)
		.map(s => new RegExp(s, 'i'));
}

/** Commit kind from its subject: 'ui_zh', 'patch', 'caddo', 'upstream' or 'other'. */
export function commitKind(subject) {
	if (/^feat\(caddo\): apply ui_zh/.test(subject)) return 'ui_zh';
	if (/^feat\(caddo\): apply robrowser-caddo\.patch/.test(subject)) return 'patch';
	if (/^\w+\([^)]*caddo[^)]*\)!?:/.test(subject)) return 'caddo';
	if (/^(?:fix|feat|perf|refactor)(?:\([^)]*\))?!?:/.test(subject)) return 'upstream';
	return 'other';
}

const CADDO_ONLY = /^(?:\.github\/workflows\/caddo-|\.github\/caddo-checks\/|\.devin\/)/;

/** C4 and C5 over a list of commits {sha, subject, body, files, deleted}. */
export function checkCommits(commits) {
	const errors = [];
	for (const [kind, label] of [
		['ui_zh', 'feat(caddo): apply ui_zh'],
		['patch', 'feat(caddo): apply robrowser-caddo.patch']
	]) {
		const n = commits.filter(c => commitKind(c.subject) === kind).length;
		if (n !== 1) {
			errors.push(
				`expected exactly one "${label}" commit since upstream, found ${n}. caddo CI reverts the ui_zh commit to run the upstream tests.`
			);
		}
	}
	for (const c of commits) {
		if (commitKind(c.subject) !== 'upstream') continue;
		const short = c.sha.slice(0, 8);
		const deleted = c.deleted || [];
		const tests = c.files.filter(f => f.startsWith('tests/') && !deleted.includes(f));
		if (!tests.length && !/^No-Test:\s*\S/m.test(c.body)) {
			errors.push(
				`${short} "${c.subject}" is meant for upstream but adds no test. Add one under tests/, or a "No-Test: <reason>" trailer, or use a (caddo) scope if it is caddo-only.`
			);
		}
		const caddoFiles = c.files.filter(f => CADDO_ONLY.test(f));
		if (caddoFiles.length) {
			errors.push(
				`${short} "${c.subject}" is meant for upstream but touches caddo-only files (${caddoFiles.join(', ')}): split them into a (caddo) commit.`
			);
		}
	}
	return errors;
}

function git(...args) {
	return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function annotate(file, line, message) {
	console.log(`::error file=${file},line=${line}::${message}`);
}

function main() {
	const baseArg = process.argv.indexOf('--base');
	const baseRef = baseArg !== -1 ? process.argv[baseArg + 1] : 'upstream/master';
	const base = git('merge-base', 'HEAD', baseRef).trim();
	let failures = 0;

	// C1, C2: the whole tree
	const sources = git('ls-files', 'src')
		.split('\n')
		.filter(f => /\.(js|html)$/.test(f) && !f.startsWith('src/Vendors/'));
	for (const file of sources) {
		const text = readFileSync(file, 'utf8');
		const found = [...findInterfacePathInDataAttr(text), ...findResourceNameUserCharpage(text)];
		if (file === 'src/DB/DBManager.js') {
			found.push(...findLoaderCharset(text.replace(/\r\n/g, '\n')));
		}
		for (const f of found) {
			annotate(file, f.line, f.message);
			failures++;
		}
	}

	// C3: what each commit of this branch adds on top of upstream
	const deny = parseDenyPatterns(process.env.CADDO_DENY_PATTERNS);
	if (!deny.length) {
		if (denyPatternsRequired(process.env)) {
			console.log(
				'::error::CADDO_DENY_PATTERNS is empty: set the repository secret (pull requests from other forks get no secrets).'
			);
			failures++;
		} else {
			console.log('::warning::CADDO_DENY_PATTERNS is empty: only private-network addresses are checked.');
		}
	}
	const log = git('log', '--no-merges', '-p', '--unified=0', '--no-color', '--format=commit %H', `${base}..HEAD`);
	for (const f of findDeployValuesInLog(log, deny)) {
		// Never echo the value: the log of a public repository is public too
		annotate(f.file, f.line, `commit ${f.sha.slice(0, 8)} adds ${f.what}; this repository is public.`);
		failures++;
	}

	// C3 on commit messages, C4, C5
	const commits = git('log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', `${base}..HEAD`)
		.split('\x1e')
		.map(r => r.trim())
		.filter(Boolean)
		.map(r => {
			const [sha, subject, body] = r.split('\x1f');
			const changes = git('diff-tree', '--no-commit-id', '--name-status', '-r', sha)
				.split('\n')
				.filter(Boolean)
				.map(row => row.split('\t'));
			const files = changes.map(c => c[c.length - 1]);
			const deleted = changes.filter(c => c[0] === 'D').map(c => c[1]);
			return { sha, subject, body: body || '', files, deleted };
		});
	for (const c of commits) {
		const what = findDeployValue(`${c.subject}\n${c.body}`, deny);
		if (what) {
			console.log(`::error::commit ${c.sha.slice(0, 8)} has ${what} in its message; this repository is public.`);
			failures++;
		}
	}
	for (const message of checkCommits(commits)) {
		console.log(`::error::${message}`);
		failures++;
	}

	console.log(
		`conventions: ${sources.length} files, ${commits.length} commits since ${base.slice(0, 8)}, ${failures} problem(s)`
	);
	process.exit(failures ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
