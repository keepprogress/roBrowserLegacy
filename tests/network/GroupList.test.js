import { describe, it, expect } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import BinaryReader from 'Utils/BinaryReader.js';

// rAthena sends party and member names as UTF-8; reading them as binary strings garbles Chinese names.
function groupList(memberSize, nameAt) {
	const buf = new Uint8Array(24 + memberSize);
	const enc = new TextEncoder();
	buf.set(enc.encode('測試小隊'), 0);
	buf.set(enc.encode('波利隊長'), 24 + nameAt);
	buf.set(enc.encode('prontera.gat'), 24 + nameAt + 24);
	return buf.buffer;
}

describe('ZC_GROUP_LIST2 / ZC_GROUP_LIST3', () => {
	it.each([
		['GROUP_LIST2', 50, 4], // AID
		['GROUP_LIST3', 54, 8] // AID, GID
	])('%s decodes UTF-8 party and member names', (name, memberSize, nameAt) => {
		const buf = groupList(memberSize, nameAt);
		const pkt = new PACKET.ZC[name](new BinaryReader(buf), buf.byteLength);

		expect(pkt.groupName).toBe('測試小隊');
		expect(pkt.groupInfo).toHaveLength(1);
		expect(pkt.groupInfo[0].characterName).toBe('波利隊長');
		expect(pkt.groupInfo[0].mapName).toBe('prontera.gat');
	});
});
