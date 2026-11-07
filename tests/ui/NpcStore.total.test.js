/**
 * Barter and NPC cash shops hide the "Total : x Zeny" row. Closing them with
 * ESC/cancel skips closeStore(), so the next NPC sell/buy window has to show
 * the total again by itself.
 */
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
		}

		getRoot() {
			return this._host;
		}

		static MouseMode = {};
	}
	return { MockGUIComponent };
});

vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: c => c } }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '', getMessage: () => '' } }));
vi.mock('DB/Items/ItemType.js', () => ({ default: {} }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ save: vi.fn() }) } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: {} }));
vi.mock('Controls/KeyEventHandler.js', () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: vi.fn() } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: {} }));
vi.mock('Network/PacketStructure.js', () => ({ default: { CZ: {} } }));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({ default: { remove: vi.fn() } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: { addText: vi.fn(), TYPE: {} } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: {} }));
vi.mock('UI/Components/Inventory/InventoryItemTransfer.js', () => ({ InventoryItemTransferPriority: {} }));

const { default: NpcStore } = await import('UI/Components/NpcStore/NpcStore.js');

const root = NpcStore.getRoot();
root.innerHTML = NpcStore.render();
const shown = () => [...root.querySelectorAll('.total')].map(el => el.style.display !== 'none');

describe('NpcStore total row', () => {
	it.each([
		['barter', NpcStore.Type.BARTER_MARKET],
		['cash shop', NpcStore.Type.CASH_SHOP]
	])('comes back in a sell/buy window opened after a %s', (_name, type) => {
		NpcStore.setType(type);
		expect(shown()).not.toContain(true);

		NpcStore.setType(NpcStore.Type.SELL);
		expect(shown()).not.toContain(false);

		NpcStore.setType(type);
		NpcStore.setType(NpcStore.Type.BUY);
		expect(shown()).not.toContain(false);
	});
});
