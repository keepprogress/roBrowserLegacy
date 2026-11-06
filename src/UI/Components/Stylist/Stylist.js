/**
 * UI/Components/Stylist/Stylist.js
 *
 * 造型師視窗（ZC_UI_OPEN type 1 = STYLIST_UI）。
 * 上游 roBrowserLegacy 沒有這個視窗：伺服器的 openstylist() 只會開出空氣。
 * 伺服器不送選項清單，選項與價格來自 DB/Stylist/StylistTable.js（由 stylist.yml 產生）。
 *
 * 只做髮型／髮色／衣服顏色。頭飾（寄信發放）與 Body2 沒做：要的話在 ROWS 與送出封包補。
 */

import DB from 'DB/DBManager.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import Session from 'Engine/SessionStorage.js';
import StylistTable from 'DB/Stylist/StylistTable.js';
import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import htmlText from './Stylist.html?raw';
import cssText from './Stylist.css?raw';

const Stylist = new GUIComponent('Stylist', cssText);

Stylist.render = () => htmlText;

/** 每一列：table key → 預覽時要改實體的哪個欄位 */
const ROWS = {
	hair: 'head',
	haircolor: 'headpalette',
	clothescolor: 'bodypalette'
};

let _race = 'human';
let _sel = {}; // key → 選到的 client index（0 = 不變）
let _orig = {}; // 開窗當下的實體外觀，取消時還原
let _busy = false;

function options(key) {
	return Object.keys(StylistTable[key][_race])
		.map(Number)
		.sort((a, b) => a - b);
}

function itemName(id) {
	const it = DB.getItemInfo(id);
	return (it && (it.identifiedDisplayName || it.unidentifiedDisplayName)) || `道具 ${id}`;
}

/** 把目前選擇套到玩家實體上當預覽 */
function preview() {
	const entity = Session.Entity;
	for (const key of Object.keys(ROWS)) {
		const field = ROWS[key];
		const entry = _sel[key] ? StylistTable[key][_race][_sel[key]] : null;
		entity[field] = entry ? entry.value : _orig[field];
	}
}

function restore() {
	const entity = Session.Entity;
	for (const field of Object.values(ROWS)) {
		entity[field] = _orig[field];
	}
}

function refresh() {
	const root = Stylist.getRoot();
	let zeny = 0;
	const items = new Map(); // item id → {count, box}
	let chosen = 0;

	for (const key of Object.keys(ROWS)) {
		root.querySelector(`.row[data-key="${key}"] .value`).textContent = _sel[key] ? `第 ${_sel[key]} 號` : '不變';
		if (!_sel[key]) {
			continue;
		}
		chosen++;
		const entry = StylistTable[key][_race][_sel[key]];
		zeny += entry.zeny;
		// 伺服器：沒有道具就找禮盒，所以兩者擇一都行
		const id = entry.item || entry.box;
		if (id) {
			const cur = items.get(id) || { count: 0, hasBox: !!(entry.item && entry.box) };
			cur.count++;
			items.set(id, cur);
		}
	}

	const lines = [];
	if (zeny > 0) {
		const short = Session.zeny < zeny;
		lines.push(
			`<div${short ? ' class="short"' : ''}>費用：${zeny.toLocaleString()} Zeny${short ? '（Zeny 不足）' : ''}</div>`
		);
	}
	items.forEach((v, id) => {
		lines.push(`<div>需要：${escapeHtml(itemName(id))} × ${v.count}${v.hasBox ? '（或對應禮盒）' : ''}</div>`);
	});
	root.querySelector('.cost').innerHTML = lines.length ? lines.join('') : chosen ? '免費' : '請用箭頭挑選想換的項目';
	root.querySelector('.confirm').disabled = _busy || chosen === 0;
}

function cycle(key, dir) {
	if (_busy) {
		return;
	}
	const list = [0, ...options(key)];
	const pos = list.indexOf(_sel[key]);
	_sel[key] = list[(pos + dir + list.length) % list.length];
	preview();
	refresh();
}

function close(sendClose) {
	restore();
	Stylist.remove();
	if (sendClose) {
		Network.sendPacket(new PACKET.CZ.REQ_STYLE_CLOSE());
	}
}

Stylist.init = function init() {
	const root = this.getRoot();

	for (const key of Object.keys(ROWS)) {
		const row = root.querySelector(`.row[data-key="${key}"]`);
		row.querySelector('.prev').addEventListener('click', () => cycle(key, -1));
		row.querySelector('.next').addEventListener('click', () => cycle(key, 1));
	}

	root.querySelector('.confirm').addEventListener('click', () => {
		const pkt = new PACKET.CZ.REQ_STYLE_CHANGE2();
		pkt.HeadPalette = _sel.haircolor;
		pkt.HeadStyle = _sel.hair;
		pkt.BodyPalette = _sel.clothescolor;
		_busy = true;
		refresh();
		Network.sendPacket(pkt);
	});

	const cancel = () => close(true);
	root.querySelector('.cancel').addEventListener('click', cancel);
	root.querySelector('.close-btn').addEventListener('click', cancel);

	this.draggable(root.querySelector('.titlebar'));
};

/** 伺服器 openstylist() 的入口（UIOpen.js 呼叫） */
Stylist.open = function open() {
	const entity = Session.Entity;
	_race = DB.isDoram(entity.job) ? 'doram' : 'human';
	_sel = { hair: 0, haircolor: 0, clothescolor: 0 };
	_orig = { head: entity.head, headpalette: entity.headpalette, bodypalette: entity.bodypalette };
	_busy = false;

	this.prepare();
	this.append();
	Object.assign(this._host.style, { top: '120px', left: '120px' });
	refresh();
	this.focus();
};

/** ZC_STYLE_CHANGE_RES：0 = 成功（伺服器已關閉造型師，外觀由 SPRITE_CHANGE 同步），其他 = 失敗 */
Network.hookPacket(PACKET.ZC.STYLE_CHANGE_RES, function onStyleChangeResult(pkt) {
	if (!Stylist.__active) {
		return;
	}
	_busy = false;
	if (pkt.flag === 0) {
		ChatBox.addText('造型完成。', ChatBox.TYPE.INFO | ChatBox.TYPE.SELF);
		Stylist.remove();
		return;
	}
	// shortcut: 多項同時選且只有後面幾項失敗時，前面已成功的項目會被這裡還原回舊外觀（重新登入才會顯示真實外觀）；要精確就改成逐項送
	ChatBox.addText('造型失敗：Zeny 或道具不足。', ChatBox.TYPE.ERROR | ChatBox.TYPE.SELF);
	_sel = { hair: 0, haircolor: 0, clothescolor: 0 };
	restore();
	refresh();
});

function escapeHtml(s) {
	return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export default UIManager.addComponent(Stylist);
