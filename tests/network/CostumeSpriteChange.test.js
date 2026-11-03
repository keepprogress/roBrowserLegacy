import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import BinaryReader from 'Utils/BinaryReader.js';

const read = file => readFileSync(join(process.cwd(), 'src', file), 'utf8').replace(/\r\n/g, '\n');

// ZC_COSTUME_SPRITE_CHANGE (0x820) carries a look change like ZC_SPRITE_CHANGE2,
// so it goes to the same handler instead of being dropped.
describe('ZC_COSTUME_SPRITE_CHANGE', () => {
	it('reads the fields onEntityViewChange uses', () => {
		const buf = new ArrayBuffer(9);
		const view = new DataView(buf);
		view.setUint32(0, 150001, true); // GID
		view.setUint8(4, 4); // type: head top
		view.setInt32(5, 2205, true); // value
		const pkt = new PACKET.ZC.COSTUME_SPRITE_CHANGE(new BinaryReader(buf), buf.byteLength);

		expect(pkt).toMatchObject({ GID: 150001, type: 4, value: 2205 });
	});

	it('is handled by onEntityViewChange, as ZC_SPRITE_CHANGE2 is', () => {
		const source = read('Engine/MapEngine/Entity.js');
		expect(source).toMatch(/Network\.hookPacket\(PACKET\.ZC\.SPRITE_CHANGE2, onEntityViewChange\);/);
		expect(source).toMatch(/Network\.hookPacket\(PACKET\.ZC\.COSTUME_SPRITE_CHANGE, onEntityViewChange\);/);
	});
});
