import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	findInterfacePathInDataAttr,
	findResourceNameUserCharpage,
	findLoaderCharset,
	findDeployValue,
	findDeployValuesInLog,
	denyPatternsRequired,
	parseDenyPatterns,
	commitKind,
	checkCommits
} from './conventions.mjs';

const lines = found => found.map(f => f.line);

describe('C1 data-* attributes holding DB.INTERFACE_PATH', () => {
	it('finds the line MrAntares/roBrowserLegacy#1576 fixed', () => {
		const text = [
			'`<li class="attendance-item" ${background}>` +',
			'`<div class="item" data-background="${DB.INTERFACE_PATH}item/${item.identifiedResourceName}.bmp">` +'
		].join('\n');
		assert.deepEqual(lines(findInterfacePathInDataAttr(text)), [2]);
	});

	it('finds the other ways of writing it', () => {
		const text = [
			"html += '<div data-hover=\"' + DB.INTERFACE_PATH + 'btn_over.bmp\">';",
			'node.dataset.background = DB.INTERFACE_PATH + "item/" + name + ".bmp";',
			"el.setAttribute('data-down', DB.INTERFACE_PATH + 'btn_press.bmp');",
			"$(el).attr('data-background', DB.INTERFACE_PATH + 'bg.bmp');"
		].join('\n');
		assert.deepEqual(lines(findInterfacePathInDataAttr(text)), [1, 2, 3, 4]);
	});

	it('finds it when the concatenation is split over lines', () => {
		const text = [
			'const html =',
			'\t\'<div class="slot" data-background="\' +',
			'\tDB.INTERFACE_PATH +',
			"\t'item/' + name + '.bmp\">';"
		].join('\n');
		assert.deepEqual(lines(findInterfacePathInDataAttr(text)), [2]);
	});

	it('does not join lines that are not one concatenation', () => {
		const text = ['html += \'<div data-background="item/a.bmp">\';', 'const p = DB.INTERFACE_PATH + name;'].join(
			'\n'
		);
		assert.deepEqual(findInterfacePathInDataAttr(text), []);
	});

	it('leaves relative data-* paths and direct file loads alone', () => {
		const text = [
			'`<div class="item" data-background="item/${item.identifiedResourceName}.bmp">` +',
			'`data-background="check_attendance/bt_slot_a.bmp" data-down="check_attendance/bt_slot_press.bmp"`',
			"Client.loadFile(DB.INTERFACE_PATH + 'item/' + it.identifiedResourceName + '.bmp', data => {});",
			"entry.dataset.background = 'enchantui/bg_enc_on.bmp';",
			'_Client?.loadFile(_DB.INTERFACE_PATH + background, dataURI => {'
		].join('\n');
		assert.deepEqual(findInterfacePathInDataAttr(text), []);
	});
});

describe('C2 resource names and the langtype charset', () => {
	it('finds a resource name decoded with userCharpage', () => {
		const text = [
			'unidentifiedDisplayName: userStringDecoder.decode(unidentifiedDisplayName, userCharpage),',
			'unidentifiedResourceName: userStringDecoder.decode(unidentifiedResourceName, userCharpage),',
			'identifiedResourceName: userStringDecoder.decode(identifiedResourceName),'
		].join('\n');
		assert.deepEqual(lines(findResourceNameUserCharpage(text)), [2]);
	});

	it('reads the decode() arguments whole, nested or split over lines', () => {
		const text = [
			'identifiedResourceName: TextEncoding.decode(buffer.subarray(0, len), userCharpage),',
			'it.unidentifiedResourceName = decode(',
			'\tbytes.slice(a, b),',
			'\tuserCharpage',
			');',
			'identifiedResourceName: TextEncoding.decode(buffer.subarray(0, len), grfCharpage),',
			'if (it.identifiedResourceName == decode(x, userCharpage)) {}'
		].join('\n');
		assert.deepEqual(lines(findResourceNameUserCharpage(text)), [1, 2]);
	});

	const loaders = (luaSignature, luaBody) =>
		[
			'function loadTable(filename, separator, size, callback, onEnd, useCharPage = false) {',
			'\tdata = TextEncoding.decode(data, useCharPage ? userCharpage : null);',
			'}',
			`function loadLuaTable(${luaSignature}) {`,
			luaBody,
			'}'
		].join('\n');

	it('accepts the loaders as upstream has them', () => {
		const text = loaders(
			'file_list, table_name, callback, onEnd, contextFunc, useCharPage = true',
			'\ttable[key] = decode(value, useCharPage ? userCharpage : grfCharpage);'
		);
		assert.deepEqual(findLoaderCharset(text), []);
	});

	it('finds a swapped default, which changes every table whose caller omits the flag', () => {
		const lua = loaders(
			'file_list, table_name, callback, onEnd, contextFunc, useCharPage = false',
			'\ttable[key] = decode(value, useCharPage ? userCharpage : grfCharpage);'
		);
		assert.deepEqual(lines(findLoaderCharset(lua)), [4]);
		const table = loaders(
			'file_list, table_name, callback, onEnd, contextFunc, useCharPage = true',
			'\ttable[key] = decode(value, useCharPage ? userCharpage : grfCharpage);'
		).replace('useCharPage = false) {', 'useCharPage = true) {');
		assert.deepEqual(lines(findLoaderCharset(table)), [1]);
	});

	it('finds loadLuaTable decoding every value with userCharpage, as before #1575', () => {
		const text = loaders(
			'file_list, table_name, callback, onEnd, contextFunc',
			'\ttable[key] = userStringDecoder.decode(value, userCharpage);'
		);
		assert.equal(findLoaderCharset(text).length, 2);
	});

	it('finds a list of table names instead of the flag', () => {
		const text = loaders(
			'file_list, table_name, callback, onEnd, contextFunc, useCharPage = true',
			"\tconst charpage = ['AccNameTable'].includes(table_name) ? grfCharpage : userCharpage;"
		);
		assert.equal(findLoaderCharset(text).length, 1);
	});
});

describe('C3 deployment values', () => {
	// Built from parts, so this file holds no address itself
	const lan = ['192', '168', '1', '20'].join('.');

	it('finds private-network addresses', () => {
		assert.ok(findDeployValue(`address: "${lan}",`, []));
		assert.ok(findDeployValue(['10', '0', '0', '5'].join('.'), []));
		assert.ok(findDeployValue(['172', '20', '1', '1'].join('.'), []));
	});

	it('leaves loopback, public addresses and version numbers alone', () => {
		assert.equal(findDeployValue('host: "127.0.0.1"', []), null);
		assert.equal(findDeployValue(['172', '32', '0', '1'].join('.'), []), null);
		assert.equal(findDeployValue('"vitest": "^4.1.2"', []), null);
		assert.equal(findDeployValue(['1', '10', '0', '0', '5'].join('.'), []), null);
	});

	it('scans every commit, so a value removed later is still found', () => {
		const log = [
			'commit 1111111111111111111111111111111111111111',
			'+++ b/src/Config.local.js',
			'@@ -0,0 +3,1 @@',
			`+  address: "${lan}",`,
			'commit 2222222222222222222222222222222222222222',
			'--- a/src/Config.local.js',
			'+++ /dev/null',
			'@@ -3,1 +0,0 @@',
			`-  address: "${lan}",`
		].join('\n');
		const found = findDeployValuesInLog(log, []);
		assert.deepEqual(
			found.map(f => [f.sha.slice(0, 4), f.file, f.line]),
			[['1111', 'src/Config.local.js', 3]]
		);
		assert.ok(!JSON.stringify(found).includes(lan), 'never returns the value');
	});

	it('requires the secret on CI only', () => {
		assert.equal(denyPatternsRequired({ GITHUB_ACTIONS: 'true' }), true);
		assert.equal(denyPatternsRequired({}), false);
	});

	it('finds the values listed in the secret, one pattern per line', () => {
		const deny = parseDenyPatterns('example\\.org\n\n  secret-host  \n');
		assert.equal(deny.length, 2);
		assert.ok(findDeployValue('socketProxy: "wss://game.EXAMPLE.org/ws/"', deny));
		assert.equal(findDeployValue('remoteClient: location.origin', deny), null);
	});
});

describe('C4, C5 commits since upstream', () => {
	const commit = (subject, files, body = '', deleted = []) => ({ sha: 'abcdef1234', subject, body, files, deleted });
	const base = [
		commit('feat(caddo): apply robrowser-caddo.patch customizations', ['src/a.js']),
		commit('feat(caddo): apply ui_zh.py Chinese UI translations', ['src/b.js'])
	];

	it('classifies commits by subject', () => {
		assert.equal(commitKind('feat(caddo): apply ui_zh.py Chinese UI translations'), 'ui_zh');
		assert.equal(commitKind('ci(caddo): lint, format, build and test'), 'caddo');
		assert.equal(commitKind('fix(CheckAttendance): give the reward icon relative'), 'upstream');
		assert.equal(commitKind('fix: decode Lua tables with the filesystem charset'), 'upstream');
		assert.equal(commitKind('docs: typo'), 'other');
	});

	it('accepts the expected branch', () => {
		const commits = [
			...base,
			commit('fix: decode Lua tables', ['src/DB/DBManager.js', 'tests/db/LuaTableCharset.test.js']),
			commit('ci(caddo): lint, format, build and test', ['.github/workflows/caddo-ci.yml'])
		];
		assert.deepEqual(checkCommits(commits), []);
	});

	it('wants exactly one ui_zh commit and one patch commit', () => {
		assert.equal(checkCommits([base[0]]).length, 1);
		assert.equal(checkCommits([...base, base[1]]).length, 1);
	});

	it('wants a test with a fix meant for upstream, or a reason', () => {
		assert.equal(
			checkCommits([...base, commit('fix: handle 0x820', ['src/Engine/MapEngine/Entity.js'])]).length,
			1
		);
		assert.deepEqual(
			checkCommits([
				...base,
				commit('fix: handle 0x820', ['src/Engine/MapEngine/Entity.js'], 'Body.\n\nNo-Test: only a hook')
			]),
			[]
		);
	});

	it('does not count a deleted test as the test of a fix', () => {
		const files = ['src/DB/DBManager.js', 'tests/db/ItemLookup.test.js'];
		assert.equal(
			checkCommits([...base, commit('fix: adjust item lookup', files, '', ['tests/db/ItemLookup.test.js'])])
				.length,
			1
		);
		assert.equal(checkCommits([...base, commit('fix: adjust item lookup', files)]).length, 0);
	});

	it('wants caddo-only files out of a fix meant for upstream', () => {
		const errors = checkCommits([
			...base,
			commit('fix: something', ['src/x.js', 'tests/x.test.js', '.github/workflows/caddo-ci.yml'])
		]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /caddo-only/);
	});
});
