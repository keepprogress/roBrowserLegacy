import { beforeEach, describe, expect, it, vi } from 'vitest';

// rAthena sends one ZC_ACK_SCHEDULER_CASHITEM per tab that has items, skipping
// empty ones, and splits a big tab over several. Every tab has to show its own
// items and buy them under its own tab number.
const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
			this.magnet = {};
		}

		getRoot() {
			return this._host;
		}

		draggable() {}

		remove() {}

		static processDataAttrs() {}
	}

	return { MockGUIComponent, sent: [] };
});

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getItemInfo: id => ({ identifiedDisplayName: `item ${id}`, identifiedResourceName: `res${id}` }),
		getCashShopBannerTable: () => []
	}
}));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: pkt => mocks.sent.push(pkt) } }));
vi.mock('Network/PacketStructure.js', () => ({
	default: {
		CZ: {
			SE_PC_BUY_CASHITEM_LIST: class {},
			CASH_SHOP_CLOSE: class {}
		}
	}
}));
vi.mock('Controls/KeyEventHandler.js', () => ({ default: {} }));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({
	default: { append: vi.fn(), setType: vi.fn(), remove: vi.fn() }
}));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({
	default: { addText: vi.fn(), TYPE: {}, FILTER: {} }
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: (_k, def) => ({ ...def, save: vi.fn() }) } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({
	default: {
		addComponent(component) {
			component.getRoot().innerHTML = component.render();
			component.init();
			return component;
		},
		showMessageBox: vi.fn(),
		showPromptBox: (_text, _ok, _cancel, onOk) => onOk()
	}
}));

const { default: CashShop } = await import('UI/Components/CashShop/CashShop.js');
const { default: InputBox } = await import('UI/Components/InputBox/InputBox.js');
const { default: UIManager } = await import('UI/UIManager.js');

const item = (itemId, price = 100) => ({ itemId, price });

function shownItems() {
	return [...CashShop.getRoot().querySelectorAll('#panel-items .item')].map(el => Number(el.dataset.index));
}

function clickTab(index) {
	CashShop.getRoot()
		.querySelector(`#panel-menu .tab[data-index="${index}"]`)
		.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickPurchase(itemId) {
	CashShop.getRoot()
		.querySelector(`#panel-items .add-to-cart[data-itemid="${itemId}"]`)
		.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('Cash Shop tabs', () => {
	beforeEach(() => {
		mocks.sent.length = 0;
		CashShop.cashShopListItem = [];
		CashShop.cartItem = [];
		CashShop.activeCashMenu = 0;
		// New, then Limited split over two packets, then Scrolls; Hot is empty
		CashShop.readCashShopItems({ tabNum: 0, count: 1, items: [item(501)] });
		CashShop.readCashShopItems({ tabNum: 2, count: 2, items: [item(601), item(602)] });
		CashShop.readCashShopItems({ tabNum: 2, count: 1, items: [item(603)] });
		CashShop.readCashShopItems({ tabNum: 5, count: 1, items: [item(701)] });
	});

	it('shows each tab its own items, and an empty tab nothing', () => {
		clickTab(2);
		expect(shownItems()).toEqual([601, 602, 603]);

		clickTab(5);
		expect(shownItems()).toEqual([701]);

		clickTab(1);
		expect(shownItems()).toEqual([]);

		clickTab(0);
		expect(shownItems()).toEqual([501]);
	});

	it('buys each item under the tab it came from', () => {
		clickTab(2);
		clickPurchase(603);
		clickTab(5);
		clickPurchase(701);

		CashShop.getRoot()
			.querySelector('#purchase-btn')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(mocks.sent).toHaveLength(1);
		expect(mocks.sent[0].item_list.map(i => [i.itemId, i.tab])).toEqual([
			[603, 2],
			[701, 5]
		]);
	});

	it('searches every tab, past an empty one', () => {
		const root = CashShop.getRoot();
		root.querySelector('.cashshop-search').value = 'item 7';
		root.querySelector('.cashshop-search-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(shownItems()).toEqual([701]);
	});
});

describe('Cash Shop cart limit', () => {
	const cartAmounts = () => CashShop.cartItem.map(i => i.amount);

	function dropOnCart(itemId, count) {
		const event = new Event('drop', { bubbles: true });
		event.dataTransfer = {
			getData: () => JSON.stringify({ type: 'item', from: 'CashShop', data: { itemId } })
		};
		CashShop.getRoot().querySelector('.panel-cart-body').dispatchEvent(event);
		InputBox.onSubmitRequest(count);
	}

	function buy() {
		CashShop.getRoot()
			.querySelector('#purchase-btn')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		CashShop.setSuccessCashShopUpdate({ result: 0, cashPoints: 0, kafraPoints: 0 });
	}

	beforeEach(() => {
		mocks.sent.length = 0;
		UIManager.showMessageBox.mockClear();
		CashShop.cashShopListItem = [];
		CashShop.cartItem = [];
		CashShop.activeCashMenu = 0;
		CashShop.readCashShopItems({ tabNum: 2, count: 1, items: [item(501)] });
		clickTab(2);
	});

	it('can buy 99 of an item again after buying 99', () => {
		dropOnCart(501, 99);
		buy();
		expect(mocks.sent[0].item_list.map(i => i.amount)).toEqual([99]);
		expect(CashShop.cartItem).toEqual([]);
		UIManager.showMessageBox.mockClear();

		clickPurchase(501);

		expect(cartAmounts()).toEqual([1]);
		expect(UIManager.showMessageBox).not.toHaveBeenCalled();
	});

	it('can add an item back after removing 99 of it', () => {
		dropOnCart(501, 99);
		CashShop.getRoot()
			.querySelector('#cart-list .delete-item')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		clickPurchase(501);

		expect(cartAmounts()).toEqual([1]);
	});

	it('leaves the listed item alone', () => {
		clickPurchase(501);

		expect(CashShop.cashShopListItem[2].items[0].amount).toBeUndefined();
	});

	it('stops at 99 in the cart', () => {
		dropOnCart(501, 98);
		clickPurchase(501);
		expect(cartAmounts()).toEqual([99]);
		expect(UIManager.showMessageBox).not.toHaveBeenCalled();

		clickPurchase(501);

		expect(cartAmounts()).toEqual([99]);
		expect(UIManager.showMessageBox).toHaveBeenCalledOnce();
	});

	it('limits a dropped amount to what still fits', () => {
		dropOnCart(501, 150);
		expect(cartAmounts()).toEqual([99]);

		CashShop.cartItem[0].amount = 90;
		dropOnCart(501, 20);
		expect(cartAmounts()).toEqual([99]);
	});
});
