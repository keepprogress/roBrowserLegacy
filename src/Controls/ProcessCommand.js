/**
 * Controls/ProcessCommand.js - extended from ChatBox
 *
 * Command in chatbox handler
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import DB from 'DB/DBManager.js';
import Emotions from 'DB/Emotions.js';
import BGM from 'Audio/BGM.js';
import Sound from 'Audio/SoundManager.js';
import Session from 'Engine/SessionStorage.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import Network from 'Network/NetworkManager.js';
import ControlPreferences from 'Preferences/Controls.js';
import UIPreferences from 'Preferences/UI.js';
import AudioPreferences from 'Preferences/Audio.js';
import MapPreferences from 'Preferences/Map.js';
import CameraPreferences from 'Preferences/Camera.js';
import Renderer from 'Renderer/Renderer.js';
import Configs from 'Core/Configs.js';
import PerfProbe from 'Core/PerfProbe.js';
import EffectConst from 'DB/Effects/EffectConst.js';
import StatusState from 'DB/Status/StatusState.js';
import EntityManager from 'Renderer/EntityManager.js';
import EffectManager from 'Renderer/EffectManager.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import ChatRoomCreate from 'UI/Components/ChatRoomCreate/ChatRoomCreate.js';
import ChatRoom from 'UI/Components/ChatRoom/ChatRoom.js';
import Group from 'Engine/MapEngine/Group.js';
import Friends from 'Engine/MapEngine/Friends.js';
import Guild from 'Engine/MapEngine/Guild.js';
import HomunInformations from 'UI/Components/HomunInformations/HomunInformations.js';
import MercenaryInformations from 'UI/Components/MercenaryInformations/MercenaryInformations.js';
import CaptchaUpload from 'UI/Components/Captcha/CaptchaUpload.js';
import CaptchaSelector from 'UI/Components/Captcha/CaptchaSelector.js';
import SnowWeather from 'Renderer/Effects/SnowWeather.js';
import RainWeather from 'Renderer/Effects/RainWeather.js';
import SakuraWeatherEffect from 'Renderer/Effects/SakuraWeatherEffect.js';
import PokJukWeatherEffect from 'Renderer/Effects/PokJukWeatherEffect.js';
import CloudWeatherEffect from 'Renderer/Effects/CloudWeatherEffect.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import Navigation from 'UI/Components/Navigation/Navigation.js';
import RankingTypes from 'DB/Jobs/RankingTypes.js';

let aliases = {};

const CommandStore = {
	sound: {
		description: '切換音效播放',
		callback: function () {
			this.addText(DB.getMessage(27 + AudioPreferences.Sound.play), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			AudioPreferences.Sound.play = !AudioPreferences.Sound.play;
			AudioPreferences.save();
			if (AudioPreferences.Sound.play) {
				Sound.stop();
			}
		}
	},
	bgm: {
		description: '切換背景音樂播放',
		callback: function () {
			this.addText(DB.getMessage(31 + AudioPreferences.BGM.play), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			AudioPreferences.BGM.play = !AudioPreferences.BGM.play;
			AudioPreferences.save();

			if (AudioPreferences.BGM.play) {
				BGM.play(BGM.filename);
			} else {
				BGM.stop();
			}
			return;
		}
	},
	effect: {
		description: '切換基本圖像特效以外的所有效果顯示',
		callback: function () {
			this.addText(DB.getMessage(23 + MapPreferences.effect), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.effect = !MapPreferences.effect;
			MapPreferences.save();
			return;
		}
	},
	mineffect: {
		description: '啟用負擔較低的特效。此指令對法師的範圍技能無效。',
		callback: function () {
			this.addText(DB.getMessage(687 + MapPreferences.mineffect), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.mineffect = !MapPreferences.mineffect;
			MapPreferences.save();
			return;
		}
	},
	miss: {
		description: '切換「miss」動畫的顯示',
		callback: function () {
			this.addText(DB.getMessage(317 + MapPreferences.miss), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.miss = !MapPreferences.miss;
			MapPreferences.save();
			return;
		}
	},
	li: {
		description: '切換好友或公會成員上/下線時的聊天通知',
		callback: function () {
			// The client reports the state it is switching *to*, which reading the
			// flag before flipping it gives.
			const line = UIPreferences.li
				? DB.getMessage(1045, '不在聊天視窗顯示好友的上/下線狀態。[/li OFF]')
				: DB.getMessage(1044, '在聊天視窗顯示好友的上/下線狀態。[/li ON]');

			this.addText(line, this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			UIPreferences.li = !UIPreferences.li;
			UIPreferences.save();
			return;
		}
	},
	aura: {
		description: '縮小等級 99 與 175 角色的光圈特效',
		callback: function () {
			const isSimplified = MapPreferences.aura > 1;
			this.addText(DB.getMessage(711 + isSimplified), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.aura = isSimplified ? 1 : 2;
			MapPreferences.save();

			EntityManager.forEach(function (entity) {
				entity.aura.load(EffectManager);
			});
			return;
		}
	},
	aura2: {
		description: '停用等級 99 與 175 角色的光圈特效',
		callback: function () {
			this.addText(
				DB.getMessage(
					2994 + MapPreferences.aura,
					MapPreferences.aura ? '光圈特效已關閉' : '光圈特效已開啟' // default text if not in DB msgstringtable
				),
				this.TYPE.INFO,
				this.FILTER.PUBLIC_LOG
			);
			MapPreferences.aura = MapPreferences.aura ? 0 : 1;
			MapPreferences.save();

			EntityManager.forEach(function (entity) {
				entity.aura.load(EffectManager);
			});
			return;
		}
	},
	showname: {
		description: '恢復原本的字型',
		callback: function () {
			this.addText(DB.getMessage(722 + MapPreferences.showname), this.TYPE.INFO);
			MapPreferences.showname = !MapPreferences.showname;
			MapPreferences.save();

			// update all display names
			EntityManager.forEach(function (entity) {
				entity.display.refresh(entity);
			});
			return;
		}
	},
	camera: {
		description: '切換鏡頭「平滑」效果的開啟與關閉。',
		callback: function () {
			this.addText(DB.getMessage(319 + CameraPreferences.smooth), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			CameraPreferences.smooth = !CameraPreferences.smooth;
			CameraPreferences.save();
			return;
		}
	},

	fog: {
		description: '開啟或關閉霧效',
		callback: function () {
			MapPreferences.fog = !MapPreferences.fog;
			this.addText('fog ' + (MapPreferences.fog ? 'on' : 'off'), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.save();
			return;
		}
	},

	lightmap: {
		description: '移除陰影效果與大部分光影效果',
		callback: function () {
			MapPreferences.lightmap = !MapPreferences.lightmap;
			MapPreferences.save();
			return;
		}
	},

	smoothlight: {
		description: '循環切換光照貼圖的色調分離效果：開啟、關閉、關閉但套用伽瑪校正',
		callback: function () {
			MapPreferences.smoothlight = (MapPreferences.smoothlight + 1) % 3;
			const messages = ['Posterization On', 'Smoothlight On', 'Smoothlight On with Gamma Correction'];
			this.addText(messages[MapPreferences.smoothlight], this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			MapPreferences.save();
			return;
		}
	},

	noctrl: {
		description: '只需按一次滑鼠左鍵即可持續攻擊怪物',
		callback: function () {
			this.addText(DB.getMessage(717 + ControlPreferences.noctrl), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			ControlPreferences.noctrl = !ControlPreferences.noctrl;
			ControlPreferences.save();
			return;
		},
		aliases: ['nc']
	},

	noshift: {
		description:
			' Allows targeting monsters or other players in PvP arenas with support skills without having to press the Shift key',
		callback: function () {
			this.addText(DB.getMessage(701 + ControlPreferences.noshift), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			ControlPreferences.noshift = !ControlPreferences.noshift;
			ControlPreferences.save();
			return;
		},
		aliases: ['ns']
	},

	snap: {
		description: '滑鼠游標會半自動移動到目標',
		callback: function () {
			this.addText(DB.getMessage(271 + ControlPreferences.snap), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			ControlPreferences.snap = !ControlPreferences.snap;
			ControlPreferences.save();
			return;
		}
	},

	itemsnap: {
		description: '滑鼠游標會半自動移動到掉落物',
		callback: function () {
			this.addText(DB.getMessage(276 + ControlPreferences.itemsnap), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			ControlPreferences.itemsnap = !ControlPreferences.itemsnap;
			ControlPreferences.save();
			return;
		}
	},
	window: {
		description: '切換視窗之間的吸附（磁吸）功能',
		callback: function () {
			UIPreferences.windowmagnet = !UIPreferences.windowmagnet;
			this.addText(
				'視窗磁吸 ' + (UIPreferences.windowmagnet ? 'ON' : 'OFF'),
				this.TYPE.INFO,
				this.FILTER.PUBLIC_LOG
			);
			UIPreferences.save();
			return;
		},
		aliases: ['wi']
	},

	stand: {
		description: '讓您的角色坐下或站起',
		callback: function () {
			let pkt;
			if (PACKETVER.value >= 20180307) {
				pkt = new PACKET.CZ.REQUEST_ACT2();
			} else {
				pkt = new PACKET.CZ.REQUEST_ACT();
			}
			if (Session.Entity.action === Session.Entity.ACTION.SIT) {
				pkt.action = 3; // stand up
			} else {
				pkt.action = 2; // sit down
			}
			Network.sendPacket(pkt);
			return;
		},
		aliases: ['sit']
	},

	doridori: {
		description: '讓您的角色頭部左右擺動',
		callback: function () {
			let pkt;
			Session.Entity.headDir = Session.Entity.headDir === 1 ? 2 : 1;
			if (PACKETVER.value >= 20180307) {
				pkt = new PACKET.CZ.CHANGE_DIRECTION2();
			} else {
				pkt = new PACKET.CZ.CHANGE_DIRECTION();
			}
			pkt.headDir = Session.Entity.headDir;
			pkt.dir = Session.Entity.direction;
			Network.sendPacket(pkt);

			// Doridori recovery bonus
			if (Session.Entity.action === Session.Entity.ACTION.SIT) {
				if (!Session.Entity.doriTime) {
					Session.Entity.doriTime = [0, 0, 0, 0, 0];
				}

				Session.Entity.doriTime.shift();
				Session.Entity.doriTime.push(Renderer.tick);

				const doriStart = Session.Entity.doriTime[0];
				const doriEnd = Session.Entity.doriTime[4];

				if (doriEnd - doriStart > 1500 && doriEnd - doriStart < 3000) {
					const doripkt = new PACKET.CZ.DORIDORI();
					Network.sendPacket(doripkt);
					Session.Entity.doriTime = [0, 0, 0, 0, 0];
				}
			}
			return;
		}
	},

	bangbang: {
		description: '讓您的角色順時針旋轉',
		callback: function () {
			let pkt;
			Session.Entity.direction = (Session.Entity.direction + 1) % 8;
			if (PACKETVER.value >= 20180307) {
				pkt = new PACKET.CZ.CHANGE_DIRECTION2();
			} else {
				pkt = new PACKET.CZ.CHANGE_DIRECTION();
			}
			pkt.headDir = Session.Entity.headDir;
			pkt.dir = Session.Entity.direction;
			Network.sendPacket(pkt);
			return;
		}
	},

	bingbing: {
		description: '讓您的角色逆時針旋轉',
		callback: function () {
			let pkt;
			Session.Entity.direction = (Session.Entity.direction + 7) % 8;
			if (PACKETVER.value >= 20180307) {
				pkt = new PACKET.CZ.CHANGE_DIRECTION2();
			} else {
				pkt = new PACKET.CZ.CHANGE_DIRECTION();
			}
			pkt.headDir = Session.Entity.headDir;
			pkt.dir = Session.Entity.direction;
			Network.sendPacket(pkt);
			return;
		}
	},

	where: {
		description: '以地圖名稱與座標顯示您的角色位置',
		callback: function () {
			const currentMap = MapRenderer.currentMap;
			this.addText(
				DB.getMapName(currentMap) +
					'(' +
					currentMap +
					') : ' +
					Math.floor(Session.Entity.position[0]) +
					', ' +
					Math.floor(Session.Entity.position[1]),
				this.TYPE.INFO,
				this.FILTER.PUBLIC_LOG
			);
			return;
		}
	},

	who: {
		description: '顯示伺服器目前的上線人數',
		callback: function () {
			const pkt = new PACKET.CZ.REQ_USER_COUNT();
			Network.sendPacket(pkt);
			return;
		},
		aliases: ['w']
	},

	memo: {
		description: '記錄一個地點，供傳送之陣技能使用',
		callback: function () {
			const pkt = new PACKET.CZ.REMEMBER_WARPPOINT();
			Network.sendPacket(pkt);
			return;
		}
	},

	chat: {
		description: '建立聊天室',
		callback: function () {
			ChatRoomCreate.show();
			return;
		}
	},

	q: {
		description: '離開聊天室',
		callback: function () {
			ChatRoom.remove();
			return;
		}
	},

	leave: {
		description: '離開隊伍',
		callback: function () {
			Group.onRequestLeave();
			return;
		}
	},

	invite: {
		description: '「<name>」邀請其他人加入您的隊伍。可跨地圖使用',
		callback: function (text) {
			const matches = text.match(/^invite\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				Group.onRequestInvitation(0, matches[2]);
				return;
			}
		}
	},

	organize: {
		description: '建立名為 <Party Name> 的隊伍',
		callback: function (text) {
			const matches = text.match(/^organize\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				Group.onRequestCreationEasy(matches[2]);
				return;
			}
		}
	},

	hi: {
		description: '傳送指定訊息給好友名單上的所有人',
		callback: function () {
			Friends.sayHi();
			return;
		}
	},

	ex: {
		description: '封鎖來自 <Character Name> 的悄悄話，或列出已封鎖的角色',
		callback: function (text) {
			const matches = text.match(/^ex\s+(.*\S)/);
			if (matches) {
				requestWhisperSetting(matches[1], 0);
				return;
			}

			const pkt = new PACKET.CZ.REQ_WHISPER_LIST();
			Network.sendPacket(pkt);
		}
	},

	in: {
		description: '允許來自 <Character Name> 的悄悄話',
		callback: function (text) {
			const matches = text.match(/^in\s+(.*\S)/);
			if (matches) {
				requestWhisperSetting(matches[1], 1);
				return;
			}

			this.addText(DB.getMessage(44), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
		}
	},

	exall: {
		description: '封鎖所有人的悄悄話',
		callback: function () {
			const pkt = new PACKET.CZ.SETTING_WHISPER_STATE();
			pkt.type = 0;
			Network.sendPacket(pkt);
		}
	},

	inall: {
		description: '允許所有人的悄悄話',
		callback: function () {
			const pkt = new PACKET.CZ.SETTING_WHISPER_STATE();
			pkt.type = 1;
			Network.sendPacket(pkt);
		}
	},

	guild: {
		description: '建立名為 <Guild Name> 的公會。需要建立者的物品欄中持有華麗金屬',
		callback: function (text) {
			const matches = text.match(/^guild\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				Guild.createGuild(matches[2]);
				return;
			}
		}
	},

	guildinvite: {
		description: '邀請指定的玩家加入您的公會',
		callback: function (text) {
			const matches = text.match(/^guildinvite\s+(.+)/);
			if (matches && matches[1]) {
				Guild.requestPlayerInvitationByName(matches[1]);
				return;
			}

			this.addText('用法：/guildinvite <Character Name>', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
		}
	},

	breakguild: {
		description: '解散公會。僅公會會長可使用，須先踢除所有成員',
		callback: function (text) {
			const matches = text.match(/^breakguild\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				Guild.breakGuild(matches[2]);
				return;
			}
		}
	},

	alchemist: {
		description: '顯示伺服器中前 10 名製作藥品的鍊金術師。',
		callback: function () {
			if (PACKETVER.value >= 20130605) {
				const pkt = new PACKET.CZ.RANKING();
				pkt.rankType = RankingTypes.ALCHEMIST;
				Network.sendPacket(pkt);
			} else {
				const pkt = new PACKET.CZ.ALCHEMIST_RANK();
				Network.sendPacket(pkt);
			}
			return;
		}
	},

	blacksmith: {
		description: '顯示伺服器中前 10 名鍛造/精煉的鐵匠',
		callback: function () {
			if (PACKETVER.value >= 20130605) {
				const pkt = new PACKET.CZ.RANKING();
				pkt.rankType = RankingTypes.BLACKSMITH;
				Network.sendPacket(pkt);
			} else {
				const pkt = new PACKET.CZ.BLACKSMITH_RANK();
				Network.sendPacket(pkt);
			}
			return;
		}
	},

	taekwon: {
		description: '依完成跆拳任務的次數，顯示伺服器中前 10 名跆拳少年',
		callback: function () {
			if (PACKETVER.value >= 20130605) {
				const pkt = new PACKET.CZ.RANKING();
				pkt.rankType = RankingTypes.TAEKWON;
				Network.sendPacket(pkt);
			} else {
				const pkt = new PACKET.CZ.TAEKWON_RANK();
				Network.sendPacket(pkt);
			}
			return;
		}
	},

	hoai: {
		description: '切換生命體 AI 的預設與自訂模式',
		callback: function () {
			Session.homCustomAI = !Session.homCustomAI;
			if (Session.homCustomAI) {
				HomunInformations.resetAI();
				this.addText(DB.getMessage(1024), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			} else {
				HomunInformations.resetAI();
				this.addText(DB.getMessage(1023), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			}
			return;
		}
	},

	merai: {
		description: '切換傭兵 AI 的預設與自訂模式',
		callback: function () {
			Session.merCustomAI = !Session.merCustomAI;
			if (Session.merCustomAI) {
				this.addText(DB.getMessage(1274), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				MercenaryInformations.resetAI();
			} else {
				MercenaryInformations.resetAI();
				this.addText(DB.getMessage(1273), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			}
			return;
		}
	},
	call: {
		description: '切換是否可被緊急召集。',
		callback: function () {
			const pkt = new PACKET.CZ.CONFIG();
			pkt.Config = 1;
			pkt.Value = !Session.Entity.call_flag ? 1 : 0;
			Network.sendPacket(pkt);
			return;
		}
	},

	cl: {
		description: '傳送訊息給玩家所屬的公會。',
		callback: function (text) {
			const pkt = new PACKET.CZ.CLAN_CHAT();
			const matches = text.match(/(^cl)\s+(.*)/);
			if (matches && matches[2]) {
				pkt.msg = Session.Entity.display.name + ' : ' + matches[2];
				Network.sendPacket(pkt);
				return;
			}
		}
	},

	/*
	 *  GM COMMANDS
	 */
	broadcast: {
		description: '以您的名字發送廣播訊息（黃色）。',
		callback: function (text) {
			const matches = text.match(/(^broadcast|^b)\s+(.*)/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.BROADCAST();
				pkt.msg = Session.Entity.display.name + ' : ' + matches[2];
				Network.sendPacket(pkt);
				return;
			}
		},
		aliases: ['b']
	},
	nb: {
		description: '發送不附上您名字的廣播訊息（黃色）。',
		callback: function (text) {
			const matches = text.match(/(^nb)\s+(.*)/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.BROADCAST();
				pkt.msg = matches[2];
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	localbroadcast: {
		description: '以您的名字發送本地廣播訊息。（黃色）',
		callback: function (text) {
			const matches = text.match(/(^localbroadcast|^lb)\s+(.*)/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.LOCALBROADCAST();
				pkt.msg = Session.Entity.display.name + ' : ' + matches[2];
				Network.sendPacket(pkt);
				return;
			}
		},
		aliases: ['lb']
	},
	nlb: {
		description: '發送不附上您名字的本地廣播訊息。（黃色）',
		callback: function (text) {
			const matches = text.match(/(^nlb)\s+(.*)/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.LOCALBROADCAST();
				pkt.msg = matches[2];
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	mapmove: {
		description: '移動到地圖 x y 座標。',
		callback: function (text) {
			const matches = text.match(/(^mapmove|^mm)\s+([\w.]+)\s+(\d+)\s+(\d+)/);
			if (matches) {
				const pkt = new PACKET.CZ.MOVETO_MAP();
				pkt.mapName = matches[2];
				pkt.xPos = parseInt(matches[3], 10);
				pkt.yPos = parseInt(matches[4], 10);
				Network.sendPacket(pkt);
				return;
			}
		},
		aliases: ['mm']
	},
	shift: {
		description: '傳送到指定角色。',
		callback: function (text) {
			const matches = text.match(/^shift\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.SHIFT();
				pkt.CharacterName = matches[2].trim();
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	summon: {
		description: '將玩家召喚到您的位置。',
		callback: function (text) {
			const matches = text.match(/^summon\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.RECALL_GID();
				pkt.CharacterName = matches[2].trim();
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	recall: {
		description: '依帳號名稱召喚玩家。',
		callback: function (text) {
			const matches = text.match(/^recall\s+(.*)/);
			if (matches && matches[1]) {
				const pkt = new PACKET.CZ.RECALL();
				pkt.AccountName = matches[1].trim();
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	hide: {
		description: '切換完美隱藏。',
		callback: function () {
			// Server handles toggle state
			const pkt = new PACKET.CZ.CHANGE_EFFECTSTATE();
			pkt.EffectState = StatusState.EffectState.INVISIBLE;
			Network.sendPacket(pkt);
			return;
		}
	},
	kill: {
		description: '斷開玩家連線（需要帳號 ID）。',
		callback: function (text) {
			const matches = text.match(/(^kill)\s+(\d+)/);
			if (matches) {
				const pkt = new PACKET.CZ.DISCONNECT_CHARACTER();
				pkt.AID = matches[2];
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	killall: {
		description: '斷開所有玩家的連線。',
		callback: function () {
			const pkt = new PACKET.CZ.DISCONNECT_ALL_CHARACTER();
			Network.sendPacket(pkt);
			return;
		}
	},
	item: {
		description: '建立道具或怪物（使用 AEGIS 名稱）。',
		callback: function (text) {
			const matches = text.match(/(^item|^monster)\s+(")?([^"]+)(")?/);
			if (matches && matches[3]) {
				const pkt = new PACKET.CZ.ITEM_CREATE();
				pkt.itemName = matches[3];
				Network.sendPacket(pkt);
				return;
			}
		},
		aliases: ['monster']
	},
	resetstate: {
		description: '重置能力值。',
		callback: function () {
			const pkt = new PACKET.CZ.RESET();
			pkt.type = 0;
			Network.sendPacket(pkt);
			return;
		}
	},
	resetskill: {
		description: '重置技能。',
		callback: function () {
			const pkt = new PACKET.CZ.RESET();
			pkt.type = 1;
			Network.sendPacket(pkt);
			return;
		}
	},
	remove: {
		description: '移除玩家（需要帳號名稱）',
		callback: function (text) {
			const matches = text.match(/(^remove)\s+(.*)/);
			if (matches) {
				const pkt = new PACKET.CZ.REMOVE_AID();
				pkt.AccountName = matches[2];
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	changemaptype: {
		description: '變更地圖格子類型（x,y,type）。',
		callback: function (text) {
			const matches = text.match(/(^changemaptype|cmt)\s+(\d+)\s+(\d+)\s+(\d+)/);
			if (matches) {
				const pkt = new PACKET.CZ.MOVETO_MAP();
				pkt.xPos = matches[2];
				pkt.yPos = matches[3];
				pkt.type = matches[4];
				Network.sendPacket(pkt);
				return;
			}
		},
		aliases: ['cmt']
	},
	check: {
		description: '查看玩家能力值（GM 指令）。',
		callback: function (text) {
			const matches = text.match(/^check\s+(")?([^"]+)(")?/);
			if (matches && matches[2]) {
				const pkt = new PACKET.CZ.REQ_STATUS_GM();
				pkt.CharName = matches[2].trim();
				Session.gmCheckTarget = pkt.CharName;
				Network.sendPacket(pkt);
				return;
			}
		}
	},
	macro_register: {
		description: '開啟驗證碼系統的圖片上傳介面',
		callback: function () {
			CaptchaUpload.prepare();
			CaptchaUpload.append();
		},
		aliases: ['mr']
	},
	macro_detector: {
		description: '開啟巨集偵測介面',
		callback: function () {
			CaptchaSelector.prepare();
			CaptchaSelector.append();
		},
		aliases: ['md']
	},
	macro_preview: {
		description: '請求預覽驗證碼圖片',
		callback: function (text) {
			const matches = text.match(/^macro_preview\s+(\d+)/);
			if (matches && matches[1]) {
				const pkt = new PACKET.CZ.REQ_PREVIEW_MACRO_DETECTOR();
				pkt.captchaID = matches[1];
				Network.sendPacket(pkt);
			}
			return;
		}
	},
	navi: {
		description: '前往地圖上的指定座標。用法：/navi mapname x y',
		callback: function (text) {
			const matches = text.match(/^navi\s+(\S+)\s+(\d+)\s+(\d+)/);
			if (matches) {
				Navigation.append();
				Navigation.navigateTo({
					startMap: MapRenderer.currentMap,
					startX: Session.Entity.position[0] | 0,
					startY: Session.Entity.position[1] | 0,
					endMap: matches[1],
					endX: parseInt(matches[2], 10),
					endY: parseInt(matches[3], 10),
					displayName: matches[1] + ' (' + matches[2] + ', ' + matches[3] + ')'
				});
				return;
			}
		}
	},
	commands: {
		description: '顯示可用的指令。',
		callback: function () {
			function addTextCommand(cmd, commands) {
				let textAliases = '';

				if (commands[cmd].aliases && commands[cmd].aliases.length > 0) {
					textAliases = ` (${commands[cmd].aliases.join(', ')})`;
				}

				return `/${cmd}` + textAliases + ` : ${commands[cmd].description || 'Unknown description.'}\n`;
			}
			// we list custom in a separate section
			let customsEnabled = false;

			const separator = '=======================\n';

			let messages = `${separator}Available Commands:\n${separator}`;
			let customMessages = `${separator}Custom Commands:\n${separator}`;

			const sortedCommands = {};

			// sort a-z commands by their name
			Object.keys(CommandStore)
				.sort()
				.forEach(function (key) {
					sortedCommands[key] = CommandStore[key];
				});

			for (const cmd in sortedCommands) {
				if (sortedCommands[cmd].custom) {
					customMessages += addTextCommand(cmd, sortedCommands);
					customsEnabled = true;
				} else {
					messages += addTextCommand(cmd, sortedCommands);
				}
			}

			this.addText(messages, this.TYPE.BLUE, this.FILTER.PUBLIC_LOG);

			if (customsEnabled) {
				this.addText(customMessages, this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
			}

			return;
		},
		aliases: ['cmd', 'h', 'help']
	}
};

// Dev-only weather helper to trigger weather effects locally.
if (Configs.get('development')) {
	CommandStore.weather = {
		description: '僅供開發使用的天氣切換。用法：/weather snow|rain|leaves|sakura|fireworks|cloud|cloud2|off',
		callback: function (text) {
			const args = text.trim().split(/\s+/).slice(1);
			const mode = (args[0] || '').toLowerCase();

			if (!mode || mode === 'help') {
				this.addText(
					'用法：/weather snow|rain|leaves|sakura|fireworks|cloud|cloud2|off',
					this.TYPE.INFO,
					this.FILTER.PUBLIC_LOG
				);
				return;
			}

			if (!Session.Entity) {
				return;
			}

			const ownerAID = Session.Entity.GID || Session.GID || Session.AID;

			if (mode === 'snow' || mode === 'on') {
				EffectManager.spam({
					effectId: EffectConst.EF_SNOW,
					ownerAID: ownerAID
				});
				this.addText('開始降雪。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'rain') {
				EffectManager.spam({
					effectId: EffectConst.EF_RAIN,
					ownerAID: ownerAID
				});
				this.addText('開始下雨。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'sakura') {
				EffectManager.spam({
					effectId: EffectConst.EF_SAKURA,
					ownerAID: ownerAID
				});
				this.addText('櫻花樹葉開始飄落。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'leaves') {
				EffectManager.spam({
					effectId: EffectConst.EF_MAPLE,
					ownerAID: ownerAID
				});
				this.addText('落葉飄落。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'fireworks') {
				EffectManager.spam({
					effectId: EffectConst.EF_POKJUK,
					ownerAID: ownerAID
				});
				this.addText('煙火已施放。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'cloud') {
				EffectManager.spam({
					effectId: EffectConst.EF_CLOUD,
					ownerAID: ownerAID
				});
				this.addText('雲朵出現。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'cloud2') {
				EffectManager.spam({
					effectId: EffectConst.EF_CLOUD2,
					ownerAID: ownerAID
				});
				this.addText('另一種雲朵出現。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'off' || mode === 'stop' || mode === 'clear') {
				SnowWeather.stop(ownerAID, Renderer.tick);
				RainWeather.stop(ownerAID, Renderer.tick);
				SakuraWeatherEffect.stop(ownerAID, Renderer.tick);
				PokJukWeatherEffect.stop(ownerAID, Renderer.tick);
				CloudWeatherEffect.stop(ownerAID, Renderer.tick);

				this.addText('天氣效果停止。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			this.addText(
				'未知的天氣。用法：/weather snow|rain|leaves|sakura|fireworks|cloud|cloud2|off',
				this.TYPE.INFO,
				this.FILTER.PUBLIC_LOG
			);
		}
	};
}

// Performance probe readout, when the configuration switches the probe on (Core/PerfProbe.js)
if (Configs.get('perfProbe')) {
	CommandStore.perf = {
		description: '效能監測。用法：/perf [reset|slow|overlay on|off]',
		callback: function (text) {
			const args = text.trim().split(/\s+/).slice(1);
			const mode = (args[0] || '').toLowerCase();

			if (!PerfProbe.enabled) {
				this.addText('效能監測未在執行。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (!mode || mode === 'stats') {
				const stats = PerfProbe.stats();
				console.log('[PerfProbe] stats', stats);
				this.addText(
					`${stats.fps} fps（繪製 ${stats.drawingSeconds} 秒）：畫面 p50 ${stats.frameMs.p50} / p99 ${stats.frameMs.p99} ms， ` +
						`處理 ${stats.workMs.avg} ms，${stats.drawCalls.avg} 次繪製，${stats.hitches} 次卡頓`,
					this.TYPE.INFO,
					this.FILTER.PUBLIC_LOG
				);
				return;
			}

			if (mode === 'reset') {
				PerfProbe.reset();
				this.addText('效能監測已重置。', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
				return;
			}

			if (mode === 'slow') {
				const slow = PerfProbe.slowFrames();
				const total = PerfProbe.stats().slowFrames;
				console.table(slow);
				this.addText(
					total > slow.length
						? `${total} frames over 33 ms since the last reset; the first ${slow.length} are listed.`
						: `${slow.length} 個畫面超過 33 ms（自上次重置後）。`,
					this.TYPE.INFO,
					this.FILTER.PUBLIC_LOG
				);
				return;
			}

			if (mode === 'overlay') {
				PerfProbe.overlay((args[1] || 'on').toLowerCase() !== 'off');
				return;
			}

			this.addText('用法：/perf [reset|slow|overlay on|off]', this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
		}
	};
}

/**
 * Load aliases
 */
function loadAliases() {
	for (const cmd in CommandStore) {
		if (CommandStore[cmd].aliases) {
			for (let i = 0; i < CommandStore[cmd].aliases.length; i++) {
				aliases[CommandStore[cmd].aliases[i]] = cmd;
			}
		}
	}
}

loadAliases();

/**
 * Block or allow whispers from a character
 *
 * @param {string} name
 * @param {number} type - 0 block, 1 allow
 */
function requestWhisperSetting(name, type) {
	const pkt = new PACKET.CZ.SETTING_WHISPER_PC();
	pkt.name = name;
	pkt.type = type;
	Network.sendPacket(pkt);

	// The reply does not carry the name, and replies come back in request order
	ChatBox.PrivateMessageStorage.blockNicks.push(name);
}

/**
 * Process command
 */
function processCommand(text) {
	const cmd = text.split(' ')[0];
	let pkt, matches;

	// Check if the command exists in the store
	if (CommandStore[cmd]) {
		CommandStore[cmd].callback.call(this, text);
	} else if (aliases[cmd]) {
		const parentCommand = aliases[cmd];
		CommandStore[parentCommand].callback.call(this, text);
	} else {
		// /str+
		// TODO: do we have to spam the server with "1" unit or do we have to fix the servers code ?
		matches = text.match(/^(\w{3})\+ (\d+)$/);
		if (matches) {
			const pos = ['str', 'agi', 'vit', 'int', 'dex', 'luk'].indexOf(matches[1]);
			if (pos > -1 && matches[2] !== 0) {
				pkt = new PACKET.CZ.STATUS_CHANGE();
				pkt.statusID = pos + 13;
				pkt.changeAmount = parseInt(matches[2], 10);
				Network.sendPacket(pkt);
				return;
			}
		}

		if (matches) {
			const pos = ['pow', 'sta', 'wis', 'spl', 'con', 'crt'].indexOf(matches[1]);
			if (pos > -1 && matches[2] !== 0) {
				pkt = new PACKET.CZ.STATUS_CHANGE();
				pkt.statusID = pos + 219;
				pkt.changeAmount = parseInt(matches[2], 10);
				Network.sendPacket(pkt);
				return;
			}
		}

		// Show emotion
		if (cmd in Emotions.commands) {
			pkt = new PACKET.CZ.REQ_EMOTION();
			pkt.type = Emotions.commands[cmd];
			Network.sendPacket(pkt);
			return;
		}

		// Command not found
		this.addText(DB.getMessage(95), this.TYPE.INFO, this.FILTER.PUBLIC_LOG);
	}
}

/**
 * Add a command to the store
 */
function addCommand(name, description = '', callback = () => {}, alias = [], custom = true) {
	callback = callback.bind(ChatBox);

	CommandStore[name] = {
		description: description,
		callback: callback,
		aliases: alias,
		custom
	};
	reloadAliases();
}

/**
 * Remove a command from the store
 */
function removeCommand(name) {
	delete CommandStore[name];
	reloadAliases();
}

/**
 * Reload aliases (we dont reload aliases on each ProcessCommand because it's not a common operation)
 */
function reloadAliases() {
	aliases = {};
	loadAliases();
}

/**
 * Export Methods
 */
export default {
	processCommand: processCommand,
	add: addCommand,
	remove: removeCommand,
	isEnabled: name => name in CommandStore,
	reloadAliases: reloadAliases
};
