(() => {
    const MODULE_NAME = 'fair-game-referee';
    const CHARACTER_PROFILE_KEY = `${MODULE_NAME}_character_profile`;
    const EXT_PATH = '/scripts/extensions/third-party/fair-game-referee';
    const LONG_PRESS_MS = 550;

    const defaultSettings = Object.freeze({
        enabled: true,
        longPressOpenEnabled: true,

        manualPlayers: '',
        playerProfileLibraryJson: '{}',
        activePlayerProfileName: '',
        includeUserDefault: true,
        userAliases: '你,user,用户,我',
        userCanonicalName: 'user',
        includeCharDefault: true,
        nameBlacklist: '旁白,系统,narrator,system,system note,gm,主持人',

        roundTriggerWords: '下一轮,新一轮,next round',
        flightStartKeywords: '飞行棋,玩飞行棋,开始玩飞行棋',
        flightReplayKeywords: '重玩,再玩一次,重新开始',

        diceStartKeywords: '骰子,玩骰子,大话骰',
        // 骰子数量模式：auto=按玩家数自动切换，fixed=固定颗数
        diceCountMode: 'auto', // auto | fixed
        diceFixedCount: 1,     // fixed模式下：1或2
        diceAutoSwitchPlayerCount: 6, // auto模式：玩家数 >= 这个值时用2d6
        clickAnimationMs: 2200, // 点击“摇骰子”动画总时长(ms)
        kingStartKeywords: '国王游戏,国王牌',
        truthDareStartKeywords: '真心话大冒险',
        rouletteStartKeywords: '俄罗斯转盘',

        fairnessMode: 'strict', // strict | director | display_only
        reinjectPendingEachUserMessage: false,

        // 外部判定LLM
        classifierEnabled: false,
        classifierProvider: 'none', // none | openai_compat | google_ai_studio
        classifierApiKey: '',
        openaiEndpoint: '',
        openaiModel: '',
        googleModel: '',
        classifierEveryMsg: false,
        classifierModelListJson: '[]',

        flightMapJson: JSON.stringify({ winPosition: 20, events: [] }, null, 2),
        mapLibraryJson: '',
    });

    let uiMounted = false;
    let longPressBound = false;
    let lpTimer = null;

    function ctx() { return SillyTavern.getContext(); }

    function parseList(text) {
        return String(text || '')
            .split(/[\n,，]/g)
            .map(x => x.trim())
            .filter(Boolean);
    }

    function normalizeName(name) { return String(name || '').trim().toLowerCase(); }
    function makeLowerSet(text) { return new Set(parseList(text).map(normalizeName)); }
    function roll(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    function clampInt(n, min, max, fallback) {
        const x = Math.trunc(Number(n));
        if (!Number.isFinite(x)) return fallback;
        return Math.min(max, Math.max(min, x));
    }

    // ===== 修复点1：更强的模式归一化，兼容旧值/脏值 =====
    function normalizeDiceMode(raw) {
        const x = String(raw || '').trim().toLowerCase();
        if (!x) return 'auto';
        if (['auto', '自动', '自动模式'].includes(x)) return 'auto';
        if (['fixed', '固定', '固定模式', 'manual'].includes(x)) return 'fixed';
        return 'auto';
    }

    // ===== 修复点2：统一在读取时纠偏，防止设置脏数据导致永远1骰 =====
    function sanitizeSettingsObject(s) {
        s.diceCountMode = normalizeDiceMode(s.diceCountMode);
        s.diceFixedCount = clampInt(s.diceFixedCount, 1, 2, 1);
        s.diceAutoSwitchPlayerCount = clampInt(s.diceAutoSwitchPlayerCount, 2, 99, 6);

        if (typeof s.flightMapJson !== 'string' || !s.flightMapJson.trim()) {
            s.flightMapJson = JSON.stringify({ winPosition: 20, events: [] }, null, 2);
        }
        if (typeof s.mapLibraryJson !== 'string') s.mapLibraryJson = '';
        if (typeof s.playerProfileLibraryJson !== 'string' || !s.playerProfileLibraryJson.trim()) {
            s.playerProfileLibraryJson = '{}';
        }
        if (typeof s.activePlayerProfileName !== 'string') {
            s.activePlayerProfileName = '';
        }
        s.clickAnimationMs = clampInt(s.clickAnimationMs, 800, 6000, 2200);
    }

    function getSettings() {
        const c = ctx();
        if (!c.extensionSettings[MODULE_NAME]) c.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        for (const k of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(c.extensionSettings[MODULE_NAME], k)) c.extensionSettings[MODULE_NAME][k] = defaultSettings[k];
        }
        sanitizeSettingsObject(c.extensionSettings[MODULE_NAME]);
        const ensured = ensureCharacterNamedProfile(c.extensionSettings[MODULE_NAME]);
        if (ensured.changed) c.saveSettingsDebounced();
        return c.extensionSettings[MODULE_NAME];
    }

    function getChatState() {
        const c = ctx();
        if (!c.chatMetadata[MODULE_NAME]) {
            c.chatMetadata[MODULE_NAME] = {
                currentGame: '',
                round: 0,
                players: [],
                flight: { positions: {} },
                lastResult: null,
                pendingPacket: null,
                lastHandledUserFingerprint: '',
                lastClassifier: null,
                historyStack: [],
                futureStack: [],
            };
        }
        return c.chatMetadata[MODULE_NAME];
    }

    function ensureRoundHistoryState(state) {
        if (!Array.isArray(state.historyStack)) state.historyStack = [];
        if (!Array.isArray(state.futureStack)) state.futureStack = [];
    }

    function makeRoundSnapshot(state) {
        return clonePlain({
            currentGame: state.currentGame || '',
            round: Number(state.round) || 0,
            players: Array.isArray(state.players) ? state.players : [],
            flight: state.flight && typeof state.flight === 'object' ? state.flight : { positions: {} },
            lastResult: state.lastResult || null,
            pendingPacket: state.pendingPacket || null,
        });
    }

    function applyRoundSnapshot(state, snap) {
        const s = snap && typeof snap === 'object' ? snap : {};
        state.currentGame = String(s.currentGame || '');
        state.round = Math.max(0, Math.trunc(Number(s.round) || 0));
        state.players = Array.isArray(s.players) ? s.players : [];
        state.flight = s.flight && typeof s.flight === 'object' ? s.flight : { positions: {} };
        state.lastResult = s.lastResult || null;
        state.pendingPacket = s.pendingPacket || null;
        ensureRoundHistoryState(state);
    }

    function syncPromptFromState(state) {
        if (state?.pendingPacket) {
            setRoundExtensionPrompt(buildInjectionText(state.pendingPacket));
        } else {
            clearRoundExtensionPrompt();
        }
    }

    function pushRoundHistorySnapshot(state) {
        ensureRoundHistoryState(state);
        state.historyStack.push(makeRoundSnapshot(state));
        if (state.historyStack.length > 50) {
            state.historyStack.splice(0, state.historyStack.length - 50);
        }
        state.futureStack = [];
    }

    async function undoRound() {
        const c = ctx();
        const state = getChatState();
        ensureRoundHistoryState(state);

        if (!state.historyStack.length) {
            return { ok: false, error: '没有可回退的上一轮' };
        }

        state.futureStack.push(makeRoundSnapshot(state));
        if (state.futureStack.length > 50) {
            state.futureStack.splice(0, state.futureStack.length - 50);
        }

        const prev = state.historyStack.pop();
        applyRoundSnapshot(state, prev);
        syncPromptFromState(state);
        await c.saveMetadata();

        return { ok: true, round: state.round, gameType: state.currentGame };
    }

    async function redoRound() {
        const c = ctx();
        const state = getChatState();
        ensureRoundHistoryState(state);

        if (!state.futureStack.length) {
            return { ok: false, error: '没有可前进的下一轮' };
        }

        state.historyStack.push(makeRoundSnapshot(state));
        if (state.historyStack.length > 50) {
            state.historyStack.splice(0, state.historyStack.length - 50);
        }

        const next = state.futureStack.pop();
        applyRoundSnapshot(state, next);
        syncPromptFromState(state);
        await c.saveMetadata();

        return { ok: true, round: state.round, gameType: state.currentGame };
    }

    function resolveDiceCount(settings, playerCount) {
        const mode = normalizeDiceMode(settings.diceCountMode);

        if (mode === 'fixed') {
            return clampInt(settings.diceFixedCount, 1, 2, 1);
        }

        const threshold = clampInt(settings.diceAutoSwitchPlayerCount, 2, 99, 6);
        return Number(playerCount) >= threshold ? 2 : 1;
    }

    function includesAny(textLower, csvWords) {
        const words = parseList(csvWords).map(w => w.toLowerCase()).filter(Boolean);
        return words.some(w => textLower.includes(w));
    }

    function normalizeGameType(input) {
        const x = String(input || '').trim().toLowerCase();
        if (!x) return '';
        if (['flight', 'flying_chess', 'feixingqi', '飞行棋'].includes(x)) return 'flight';
        if (['dice', 'dahuatouzi', '大话骰', '骰子'].includes(x)) return 'dice';
        if (['king', 'king_game', '国王游戏', '国王牌'].includes(x)) return 'king';
        if (['truth_dare', 'truth_or_dare', '真心话大冒险'].includes(x)) return 'truth_dare';
        if (['roulette', 'russian_roulette', '俄罗斯转盘'].includes(x)) return 'roulette';
        if (x === 'none') return '';
        return '';
    }

    function validateFlightMapJson(rawText) {
        try {
            const map = JSON.parse(rawText);
            if (!map || typeof map !== 'object') return { ok: false, error: '必须是JSON对象' };
            if (!Number.isFinite(Number(map.winPosition))) return { ok: false, error: 'winPosition 必须是数字' };
            if (!Array.isArray(map.events)) return { ok: false, error: 'events 必须是数组' };
            return { ok: true, map };
        } catch (err) {
            return { ok: false, error: `JSON解析失败: ${err.message}` };
        }
    }

    function parseFlightMap(settings) {
        const checked = validateFlightMapJson(settings.flightMapJson);
        return checked.ok ? checked.map : { winPosition: 20, events: [] };
    }

    // 地图起点自动判断：有 at=0 事件则起点0，否则起点1
    function getMapStartCell(map) {
        const events = Array.isArray(map?.events) ? map.events : [];
        const hasZero = events.some(e => Math.trunc(Number(e?.at)) === 0);
        return hasZero ? 0 : 1;
    }

    function getCurrentCharacterName() {
        const c = ctx();
        const chid = c.characterId;
        if (typeof chid !== 'number' || chid < 0) return '';
        return String(c.characters?.[chid]?.name || '').trim();
    }

    function getPlayerProfileLibrary(settings) {
        let lib = {};
        try {
            lib = JSON.parse(String(settings.playerProfileLibraryJson || '{}'));
        } catch (_e) {
            lib = {};
        }

        if (!lib || typeof lib !== 'object' || Array.isArray(lib)) lib = {};

        for (const k of Object.keys(lib)) {
            if (typeof lib[k] !== 'string') {
                lib[k] = String(lib[k] ?? '');
            }
        }

        return lib;
    }

    function setPlayerProfileLibrary(settings, lib) {
        settings.playerProfileLibraryJson = JSON.stringify(lib);
    }

    function ensureCharacterNamedProfile(settings) {
        const lib = getPlayerProfileLibrary(settings);
        const charName = getCurrentCharacterName();
        let changed = false;

        if (charName) {
            if (!Object.hasOwn(lib, charName)) {
                lib[charName] = '';
                changed = true;
            }
            if (settings.activePlayerProfileName !== charName) {
                settings.activePlayerProfileName = charName;
                changed = true;
            }
        } else {
            const fallback = String(settings.activePlayerProfileName || '默认名单').trim() || '默认名单';
            if (!Object.hasOwn(lib, fallback)) {
                lib[fallback] = '';
                changed = true;
            }
            if (settings.activePlayerProfileName !== fallback) {
                settings.activePlayerProfileName = fallback;
                changed = true;
            }
        }

        if (changed) {
            setPlayerProfileLibrary(settings, lib);
        }

        return { lib, changed };
    }

    function getEffectiveManualPlayers(settings) {
        const ensured = ensureCharacterNamedProfile(settings);
        const active = String(settings.activePlayerProfileName || '').trim();
        return String(ensured.lib[active] || '');
    }

    function resolvePlayers(settings, chat, name1, name2, suggestedPlayers = []) {
        const userAliasSet = makeLowerSet(settings.userAliases);
        const blacklistSet = makeLowerSet(settings.nameBlacklist);
        const canonical = String(settings.userCanonicalName || 'user').trim() || 'user';
        const map = new Map();

        const push = (raw) => {
            let n = String(raw || '').trim();
            if (!n) return;
            let key = normalizeName(n);
            if (blacklistSet.has(key)) return;
            if (userAliasSet.has(key)) n = canonical;
            key = normalizeName(n);
            if (!map.has(key)) map.set(key, n);
        };

        parseList(getEffectiveManualPlayers(settings)).forEach(push);
        (suggestedPlayers || []).forEach(push);
        (chat || []).forEach(m => typeof m?.name === 'string' && push(m.name));
        if (settings.includeUserDefault && name1) push(name1);
        if (settings.includeCharDefault && name2) push(name2);

        return Array.from(map.values());
    }

    function detectRoundTriggerLocal(text, settings, currentGame) {
        const t = String(text || '');
        const lower = t.toLowerCase();

        const hasRoundWord = includesAny(lower, settings.roundTriggerWords);
        const isFlightStart = includesAny(lower, settings.flightStartKeywords);
        const isFlightReplay = includesAny(lower, settings.flightReplayKeywords);

        if (isFlightStart) {
            return {
                startNewRound: true,
                gameType: 'flight',
                resetMap: isFlightReplay,
                reason: 'flight_start_local',
                playersSuggested: [],
            };
        }

        if (includesAny(lower, settings.diceStartKeywords)) {
            return { startNewRound: true, gameType: 'dice', resetMap: false, reason: 'dice_start_local', playersSuggested: [] };
        }
        if (includesAny(lower, settings.kingStartKeywords)) {
            return { startNewRound: true, gameType: 'king', resetMap: false, reason: 'king_start_local', playersSuggested: [] };
        }
        if (includesAny(lower, settings.truthDareStartKeywords)) {
            return { startNewRound: true, gameType: 'truth_dare', resetMap: false, reason: 'truth_dare_start_local', playersSuggested: [] };
        }
        if (includesAny(lower, settings.rouletteStartKeywords)) {
            return { startNewRound: true, gameType: 'roulette', resetMap: false, reason: 'roulette_start_local', playersSuggested: [] };
        }

        if (hasRoundWord && currentGame) {
            return {
                startNewRound: true,
                gameType: currentGame,
                resetMap: false,
                reason: 'next_round_word_local',
                playersSuggested: [],
            };
        }

        return { startNewRound: false, gameType: currentGame || '', resetMap: false, reason: 'none_local', playersSuggested: [] };
    }

    function pickLastMessages(chat, count = 8) {
        const arr = Array.isArray(chat) ? chat : [];
        const slice = arr.slice(-count);
        return slice.map(m => ({
            is_user: !!m?.is_user,
            name: String(m?.name || ''),
            mes: String(m?.mes || ''),
        }));
    }

    function extractJsonObjectFromText(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (_e) {}

        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            const sub = raw.slice(start, end + 1);
            try { return JSON.parse(sub); } catch (_e) {}
        }
        return null;
    }

    async function fetchJsonWithTimeout(url, options, timeoutMs = 12000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, { ...options, signal: controller.signal });
            const text = await resp.text();
            let data = null;
            try { data = JSON.parse(text); } catch (_e) {}
            return { ok: resp.ok, status: resp.status, text, data };
        } finally {
            clearTimeout(timer);
        }
    }

    async function callClassifierOpenAICompat(settings, payloadPrompt) {
        const endpoint = String(settings.openaiEndpoint || '').trim();
        const model = String(settings.openaiModel || '').trim();
        const apiKey = String(settings.classifierApiKey || '').trim();

        if (!endpoint || !model) throw new Error('OpenAI兼容判定缺少 endpoint 或 model');

        const body = {
            model,
            temperature: 0,
            messages: [
                { role: 'system', content: '你是一个游戏回合判定器，只输出JSON。' },
                { role: 'user', content: payloadPrompt },
            ],
        };

        const result = await fetchJsonWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!result.ok) throw new Error(`OpenAI兼容判定失败 HTTP ${result.status}`);
        const content = result?.data?.choices?.[0]?.message?.content ?? result.text;
        return String(content || '');
    }

    async function callClassifierGoogleAIStudio(settings, payloadPrompt) {
        const model = String(settings.googleModel || '').trim();
        const apiKey = String(settings.classifierApiKey || '').trim();

        if (!model || !apiKey) throw new Error('Google判定缺少 model 或 API key');

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const body = {
            contents: [{ role: 'user', parts: [{ text: payloadPrompt }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        };

        const result = await fetchJsonWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!result.ok) throw new Error(`Google判定失败 HTTP ${result.status}`);
        const content = result?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? result.text;
        return String(content || '');
    }

    async function classifyRoundByExternalLLM(userText, state, settings, chat) {
        if (!settings.classifierEnabled) return null;
        if (!settings.classifierProvider || settings.classifierProvider === 'none') return null;

        const currentGame = String(state.currentGame || '');
        const recent = pickLastMessages(chat, 8);

        const prompt = [
            '请根据下面对话判断是否应触发“游戏新一轮裁定”。',
            '仅输出JSON，不要解释，不要markdown，不要多余文本。',
            '',
            '输出格式：',
            '{',
            '  "shouldStartRound": boolean,',
            '  "gameType": "flight|dice|king|truth_dare|roulette|none",',
            '  "isReplay": boolean,',
            '  "players": ["name1","name2"],',
            '  "reason": "short reason"',
            '}',
            '',
            '判定规则：',
            '1) 只有用户明确表达开始某游戏/下一轮时 shouldStartRound=true。',
            '2) 如果只是普通叙事或继续本轮剧情，shouldStartRound=false。',
            `3) 当前已知游戏类型 currentGame="${currentGame || 'none'}"。`,
            '4) players 可根据最近消息的人名推测，不确定可返回空数组。',
            '',
            '最近消息(JSON)：',
            JSON.stringify(recent),
            '',
            '当前用户新消息：',
            userText,
        ].join('\n');

        let raw = '';
        if (settings.classifierProvider === 'openai_compat') raw = await callClassifierOpenAICompat(settings, prompt);
        else if (settings.classifierProvider === 'google_ai_studio') raw = await callClassifierGoogleAIStudio(settings, prompt);
        else return null;

        const parsed = extractJsonObjectFromText(raw);
        if (!parsed || typeof parsed !== 'object') throw new Error('外部判定未返回可解析JSON');

        return {
            shouldStartRound: !!parsed.shouldStartRound,
            gameType: normalizeGameType(parsed.gameType),
            isReplay: !!parsed.isReplay,
            players: Array.isArray(parsed.players) ? parsed.players.map(x => String(x || '').trim()).filter(Boolean) : [],
            reason: String(parsed.reason || ''),
            raw,
        };
    }

    function mergeDecision(localDecision, llmDecision, currentGame) {
        const finalDecision = {
            startNewRound: !!localDecision.startNewRound,
            gameType: localDecision.gameType || '',
            resetMap: !!localDecision.resetMap,
            reason: localDecision.reason || 'local',
            playersSuggested: Array.isArray(localDecision.playersSuggested) ? localDecision.playersSuggested : [],
        };

        if (!llmDecision) return finalDecision;

        if (!finalDecision.startNewRound && llmDecision.shouldStartRound) {
            finalDecision.startNewRound = true;
            finalDecision.gameType = llmDecision.gameType || currentGame || '';
            finalDecision.resetMap = !!(llmDecision.isReplay && (llmDecision.gameType || currentGame) === 'flight');
            finalDecision.reason = `llm:${llmDecision.reason || 'start_round'}`;
        }

        if (finalDecision.startNewRound && !finalDecision.gameType && llmDecision.gameType) {
            finalDecision.gameType = llmDecision.gameType;
        }

        if (Array.isArray(llmDecision.players) && llmDecision.players.length) {
            finalDecision.playersSuggested = llmDecision.players.slice(0, 20);
        }

        return finalDecision;
    }

    function runRound(gameType, players, state, settings) {
    if (gameType === 'dice') {
        const diceCount = resolveDiceCount(settings, players.length);
        const mode = normalizeDiceMode(settings.diceCountMode);

        const rows = players.map(p => {
            const dice = Array.from({ length: diceCount }, () => roll(1, 6));
            const total = dice.reduce((a, b) => a + b, 0);

            return {
                player: p,
                value: diceCount === 1 ? String(dice[0]) : `${dice.join('+')}=${total}`,
                total,
                dice,
            };
        });

        const max = Math.max(...rows.map(r => r.total));
        const winners = rows.filter(r => r.total === max).map(r => r.player);

        return {
            rows: rows.map(r => ({ player: r.player, value: r.value })),
            summary: `模式=${mode}；骰子=${diceCount}d6；最高点 ${max}，胜者：${winners.join(' / ')}`,
            cellTexts: [],
            turnOrder: [],
            collisionTexts: [],
            collisionMarks: [],
            winners: [],
        };
    }

    if (gameType === 'flight') {
        const map = parseFlightMap(settings);
        const win = Math.max(1, Math.trunc(Number(map.winPosition) || 20));
        const startCell = getMapStartCell(map);
        state.flight = state.flight || { positions: {} };

        const eventMap = new Map((Array.isArray(map.events) ? map.events : []).map(e => [Math.trunc(Number(e.at)), e]));

        for (const p of players) {
            const raw = Number(state.flight.positions[p]);
            state.flight.positions[p] = Number.isFinite(raw) ? Math.trunc(raw) : startCell;

            if (state.flight.positions[p] < startCell) state.flight.positions[p] = startCell;
            if (state.flight.positions[p] > win) state.flight.positions[p] = win;
        }

        const turnOrder = players.slice();
        for (let i = turnOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
        }

        const moveWithBounce = (from, delta) => {
            let pos = Math.trunc(Number(from) || 0) + Math.trunc(Number(delta) || 0);
            if (pos > win) {
                const overflow = pos - win;
                pos = win - overflow;
            }
            if (pos < startCell) pos = startCell;
            if (pos > win) pos = win;
            return pos;
        };

        const flightDiceCount = resolveDiceCount(settings, players.length);
        const rows = [];
        const cellTexts = [];
        const rolls = {};
        const collisionTexts = [];
        const collisionMarks = [];
        const winners = [];
        const actedPlayers = new Set();

        for (let idx = 0; idx < turnOrder.length; idx++) {
            const actor = turnOrder[idx];
            const startPos = Math.trunc(Number(state.flight.positions[actor] ?? startCell));
            const dice = Array.from({ length: flightDiceCount }, () => roll(1, 6));
            const d = dice.reduce((a, b) => a + b, 0);
            rolls[actor] = {
                dice,
                total: d,
                diceCount: flightDiceCount,
            };

            const landedByDice = moveWithBounce(startPos, d);
            const diceText = flightDiceCount === 1 ? String(dice[0]) : `${dice.join('+')}=${d}`;
            const pieces = [`顺位${idx + 1}`, `掷出${diceText}`, `起点${startPos}->掷骰落点${landedByDice}`];

            const sendVictimToStartAndResolve = (victim, byActor, hitPos, phaseLabel, phaseKey, victimHadActed) => {
                const victimBeforePos = Math.trunc(Number(state.flight.positions[victim] ?? startCell));

                let victimPos = startCell;
                const startHit = eventMap.get(startCell);

                let victimEventMove = 0;
                let victimEventText = '';

                if (startHit) {
                    victimEventMove = Math.trunc(Number(startHit.move || 0));
                    victimEventText = String(startHit.text || '').trim();
                    victimPos = moveWithBounce(startCell, victimEventMove);
                }

                state.flight.positions[victim] = victimPos;
                if (victimPos === win) winners.push(victim);

                const actedTag = victimHadActed
                    ? '（该玩家本轮已行动，已完成任务不撤销）'
                    : '（该玩家本轮未行动）';

                collisionTexts.push(
                    `${byActor} 在${hitPos}格${phaseLabel}撞到 ${victim}，被撞前位置${victimBeforePos}${actedTag}；被撞者回起点${startCell}并结算起点事件后到${victimPos}`
                );

                collisionMarks.push({
                    pos: hitPos,
                    phase: phaseKey, // pre | post
                    actor: byActor,
                    victim,
                    victimBeforePos,
                    victimHadActed,
                });

                if (startHit) {
                    if (victimEventText) {
                        cellTexts.push(`${victim}@被撞回起点触发格${startCell}:${victimEventText}`);
                    }
                    cellTexts.push(
                        `${victim}@被撞回起点最终落点${victimPos}:move${victimEventMove >= 0 ? '+' : ''}${victimEventMove}`
                    );
                } else {
                    cellTexts.push(`${victim}@被撞回起点${startCell}:无起点事件`);
                }
            };

            const preVictims = players.filter(
                p => p !== actor && Math.trunc(Number(state.flight.positions[p])) === landedByDice
            );
            if (preVictims.length) {
                for (const v of preVictims) {
                    sendVictimToStartAndResolve(v, actor, landedByDice, '（掷骰落点阶段）', 'pre', actedPlayers.has(v));
                }
                pieces.push(`相撞前置: ${preVictims.join('、')}回起点并结算起点事件`);
            }

            let finalPos = landedByDice;
            const hit = eventMap.get(landedByDice);
            let eventMove = 0;
            let eventText = '';

            if (hit) {
                eventMove = Math.trunc(Number(hit.move || 0));
                eventText = String(hit.text || '').trim();
                finalPos = moveWithBounce(landedByDice, eventMove);

                pieces.push(`触发格${landedByDice}`);
                pieces.push(`事件位移${eventMove >= 0 ? '+' : ''}${eventMove}`);
                if (eventText) {
                    pieces.push(`触发事件:${eventText}`);
                    cellTexts.push(`${actor}@触发格${landedByDice}:${eventText}`);
                }
            }

            const postVictims = players.filter(
                p => p !== actor && Math.trunc(Number(state.flight.positions[p])) === finalPos
            );
            if (postVictims.length) {
                for (const v of postVictims) {
                    sendVictimToStartAndResolve(v, actor, finalPos, '（事件后落点阶段）', 'post', actedPlayers.has(v));
                }
                pieces.push(`相撞后置: ${postVictims.join('、')}回起点并结算起点事件`);
            }

            state.flight.positions[actor] = finalPos;
            if (finalPos === win) winners.push(actor);

            pieces.push(`最终落点${finalPos}`);

            const finalCell = eventMap.get(finalPos);
            const finalCellText = String(finalCell?.text || '').trim();
            if (finalCellText) {
                pieces.push(`落点文本:${finalCellText}`);
                cellTexts.push(`${actor}@落点格${finalPos}:${finalCellText}`);
            }

            rows.push({ player: actor, value: pieces.join('，') });
            actedPlayers.add(actor);
        }

        const uniqueWinners = Array.from(new Set(winners));
        const summary = `终点${win}；起点${startCell}；骰子=${flightDiceCount}d6；到达终点：${uniqueWinners.length ? uniqueWinners.join(' / ') : '暂无'}`;
        return {
            rows,
            summary,
            cellTexts,
            turnOrder,
            collisionTexts,
            collisionMarks,
            winners: uniqueWinners,
            rolls,
        };
    }

    return {
        rows: [],
        summary: '当前示例仅实现：骰子 / 飞行棋。',
        cellTexts: [],
        turnOrder: [],
        collisionTexts: [],
        collisionMarks: [],
        winners: [],
    };
}

    function isFgrPacketSystemNote(m) {
        return !!(
            m &&
            !m.is_user &&
            String(m.name || '') === 'System Note' &&
            typeof m.mes === 'string' &&
            m.mes.includes('【公平裁定-回合包】')
        );
    }

    function removeFgrPacketSystemNotes(chat) {
        if (!Array.isArray(chat)) return;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (isFgrPacketSystemNote(chat[i])) {
                chat.splice(i, 1);
            }
        }
    }

    function setRoundExtensionPrompt(text) {
        const c = ctx();
        if (typeof c.setExtensionPrompt === 'function') {
            c.setExtensionPrompt(MODULE_NAME, String(text || ''), 1, 0, false, 0);
        }
    }

    function clearRoundExtensionPrompt() {
        const c = ctx();
        if (typeof c.setExtensionPrompt === 'function') {
            c.setExtensionPrompt(MODULE_NAME, '', 1, 0, false, 0);
        }
    }

    function buildInjectionText(packet) {
        const orderLine = (packet.turnOrder && packet.turnOrder.length)
            ? `顺序=${packet.turnOrder.join(' -> ')}。`
            : '顺序=无。';

        const collisionLine = (packet.collisionTexts && packet.collisionTexts.length)
            ? `相撞=${packet.collisionTexts.join('；')}。`
            : '相撞=无。';

        const cellTextLine = (packet.cellTexts && packet.cellTexts.length)
            ? `格子文本=${packet.cellTexts.join('；')}。`
            : '格子文本=无。';

        const winnerLine = (packet.winners && packet.winners.length)
            ? `到达终点=${packet.winners.join(' / ')}。`
            : '到达终点=暂无。';

        return [
            `【公平裁定-回合包】`,
            `游戏=${packet.gameType}；回合=${packet.round}；玩家=${packet.players.join('、')}；`,
            `结果=${packet.detail}；结论=${packet.summary}。`,
            `${orderLine}`,
            `${collisionLine}`,
            `${cellTextLine}`,
            `${winnerLine}`,

            `【强约束】你必须严格按上述结果叙事，不得改判胜负。`,
            `【持续进行】在有人到达终点之前，游戏持续进行；不得私自判定“突然结束/强制收尾”。`,

            `【回合定义】“一轮”=本轮内所有玩家都已完成一次掷骰/行动，并完成各自落点格子任务。`,
            `【下一轮定义】“下一轮/新一轮/next round”=所有玩家在上一整轮完成后，再按顺序各进行一次新的掷骰/行动与任务，不是回到起点重开。`,
            `【禁止误判重开】除非用户明确说“重玩/重开/重新开始”，否则不得把“下一轮”解释为“回到起点重头开始”。`,

            `【任务归属】每个格子任务只属于该玩家本人完成，禁止他人代做、替做、转包。`,
            `【禁止钻空子】禁止用“口头宣布完成/场外操作/规则外技巧/偷换概念”跳过或规避格子任务。`,
            `【禁止免做】除非裁定结果明确写出“免任务/跳过任务”，否则任何玩家都必须完成其落点任务。`,
            `【禁止改派】不得把A玩家任务改派给B玩家；不得把多人任务压缩为单人代办。`,

            `【任务推进约束】请先简短回顾本轮中“已完成格子任务”的玩家进度，再重点补完“尚未完成格子任务”的玩家剧情。`,
            `【禁止跳轮】在本轮所有玩家任务都完成之前，严禁发起、描写或暗示下一轮掷骰/抽牌。`,
            `【禁止自动开新轮】除非有人明确发出“下一轮/新一轮/next round”等指令，否则不得进入第${packet.round + 1}轮。`,
            `如果本轮剧情尚未写完，请继续完成第${packet.round}轮内容，不得偷跑到下一轮。`,
            `【自然收束】结尾可以自然收束：大家自行聊天/收拾/暂歇等都可以；不要集体等待或看向 user 来决定是否继续，也不要重复性地每轮都提喝酒/休息或询问是否开下一轮。`
        ].join('');
    }

    function getLastUserMessage(chat) {
        for (let i = chat.length - 1; i >= 0; i--) {
            const m = chat[i];
            if (m && m.is_user) return m;
        }
        return null;
    }

    function getUserFingerprint(m) {
        const date = String(m?.send_date ?? '');
        const mes = String(m?.mes ?? '');
        return `${date}__${mes}`;
    }

    async function applyPacketToChat(chat, packet, settings, options = {}) {
        let injectText = buildInjectionText(packet);

        if (settings.fairnessMode === 'director') {
            const edited = window.prompt('导演模式：可编辑裁定文本', injectText);
            if (typeof edited === 'string' && edited.trim()) injectText = edited.trim();
        }

        if (settings.fairnessMode !== 'display_only') {
            setRoundExtensionPrompt(injectText);
        } else {
            clearRoundExtensionPrompt();
        }

        return injectText;
    }

    globalThis.fairGameRefereeInterceptor = async function(chat, contextSize, abort, type) {
        const c = ctx();
        const s = getSettings();
        if (!s.enabled) {
            clearRoundExtensionPrompt();
            return;
        }

        const state = getChatState();
        const last = getLastUserMessage(chat);
        if (!last) return;

        const fp = getUserFingerprint(last);
        const isNewUserMessage = fp !== state.lastHandledUserFingerprint;

        if (!isNewUserMessage) {
            return;
        }

        const text = String(last.mes || '').trim();
        if (!text) {
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        const localDecision = detectRoundTriggerLocal(text, s, state.currentGame);

        let llmDecision = null;
        const shouldCallClassifier = !!(
            s.classifierEnabled &&
            s.classifierProvider !== 'none' &&
            (s.classifierEveryMsg || !localDecision.startNewRound)
        );

        if (shouldCallClassifier) {
            try {
                llmDecision = await classifyRoundByExternalLLM(text, state, s, chat);
                state.lastClassifier = {
                    at: Date.now(),
                    provider: s.classifierProvider,
                    output: llmDecision,
                };
            } catch (err) {
                console.warn('[fair-game-referee] 外部判定失败：', err);
            }
        }

        const decision = mergeDecision(localDecision, llmDecision, state.currentGame);

        if (!decision.startNewRound) {
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        if (!decision.gameType) {
            toastr.warning('[公平裁定] 尚未确定游戏类型（先说一次“飞行棋/骰子”等）');
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        const players = resolvePlayers(s, c.chat, c.name1, c.name2, decision.playersSuggested || []);
        if (players.length < 2) {
            toastr.warning(`[公平裁定] 玩家少于2人，当前识别到：${players.join('、') || '无'}`);
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        pushRoundHistorySnapshot(state);

        if (decision.gameType !== state.currentGame) {
            state.currentGame = decision.gameType;
            state.round = 0;
            if (decision.gameType === 'flight') state.flight = { positions: {} };
        }

        if (decision.gameType === 'flight' && decision.resetMap) {
            state.flight = { positions: {} };
            state.round = 0;
            state.pendingPacket = null;
            clearRoundExtensionPrompt();
        }

        state.round += 1;
        const result = runRound(state.currentGame, players, state, s);
        const detail = result.rows.map(r => `${r.player}:${r.value}`).join('；');

        const packet = {
            packetId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: state.currentGame,
            round: state.round,
            players,
            detail,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            createdAt: Date.now(),
        };

        removeFgrPacketSystemNotes(chat);
        await applyPacketToChat(chat, packet, s);

        state.players = players;
        state.lastResult = { gameType: state.currentGame, round: state.round, result };
        state.pendingPacket = packet;
        state.lastHandledUserFingerprint = fp;

        await c.saveMetadata();
        toastr.success(`[公平裁定] ${state.currentGame} 第${state.round}轮已裁定`);
    };

    function bindLongPressOnExtensionsButton() {
        if (longPressBound) return;

        const clear = () => {
            if (lpTimer) {
                clearTimeout(lpTimer);
                lpTimer = null;
            }
        };

        $(document).on('mousedown.fgr touchstart.fgr', '#extensionsMenuButton', () => {
            clear();
            const s = getSettings();
            if (!s.longPressOpenEnabled) return;
            lpTimer = setTimeout(() => {
                if (globalThis.FGR_UI?.open) {
                    globalThis.FGR_UI.open('map');
                } else {
                    toastr.warning('[公平裁定] 面板未就绪，请稍后再试');
                }
            }, LONG_PRESS_MS);
        });

        $(document).on('mouseup.fgr mouseleave.fgr touchend.fgr touchcancel.fgr', '#extensionsMenuButton', clear);
        longPressBound = true;
    }

    function bindIfExists(selector, binder) {
        const $el = $(selector);
        if ($el.length) binder($el);
    }

    function bindDrawerUI() {
        const c = ctx();
        const s = getSettings();

        bindIfExists('#fgr-enabled', $el => {
            $el.prop('checked', !!s.enabled).on('change', e => {
                s.enabled = !!$(e.target).prop('checked');
                c.saveSettingsDebounced();
            });
        });

        bindIfExists('#fgr-longpress-enabled', $el => {
            $el.prop('checked', !!s.longPressOpenEnabled).on('change', e => {
                s.longPressOpenEnabled = !!$(e.target).prop('checked');
                c.saveSettingsDebounced();
            });
        });

        bindIfExists('#fgr-open-panel', $el => {
            $el.off('click').on('click', () => {
                if (globalThis.FGR_UI?.open) {
                    globalThis.FGR_UI.open('settings');
                } else {
                    toastr.warning('[公平裁定] 面板未就绪，请稍后重试');
                }
            });
        });
    }

    async function mountDrawerUI() {
        if (uiMounted) return;
        const html = await $.get(`${EXT_PATH}/settings.html`);
        $('#extensions_settings').append(html);
        bindDrawerUI();
        uiMounted = true;
    }

    async function loadUiScript() {
        if (globalThis.FGR_UI) return;
        await $.getScript(`${EXT_PATH}/ui.js`);
    }

    function clonePlain(obj) {
        try {
            return structuredClone(obj || {});
        } catch (_e) {
            return JSON.parse(JSON.stringify(obj || {}));
        }
    }

        async function rollFlightByClick(options = {}) {
        const c = ctx();
        const s = getSettings();
        const state = getChatState();
        const resetMap = !!options.resetMap;

        if (!s.enabled) return { ok: false, error: '插件未启用' };

        const players = resolvePlayers(s, c.chat, c.name1, c.name2, []);
        if (players.length < 2) {
            return { ok: false, error: `玩家少于2人：${players.join('、') || '无'}` };
        }

        pushRoundHistorySnapshot(state);

        state.currentGame = 'flight';
        if (!state.flight || typeof state.flight !== 'object') state.flight = { positions: {} };

        if (resetMap) {
            state.round = 0;
            state.flight = { positions: {} };
            state.pendingPacket = null;
            clearRoundExtensionPrompt();
            removeFgrPacketSystemNotes(c.chat);
        }

        const beforePositions = clonePlain(state.flight.positions);
        state.round += 1;

        const result = runRound('flight', players, state, s);
        const afterPositions = clonePlain(state.flight.positions);

        const detail = result.rows.map(r => `${r.player}:${r.value}`).join('；');
        const packet = {
            packetId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: 'flight',
            round: state.round,
            players,
            detail,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            createdAt: Date.now(),
        };

        await applyPacketToChat(c.chat, packet, s, { appendToEnd: true });

        state.players = players;
        state.lastResult = { gameType: 'flight', round: state.round, result };
        state.pendingPacket = packet;

        await c.saveMetadata();

        const userName = String(s.userCanonicalName || 'user').trim() || 'user';
        const userRollInfo = result?.rolls?.[userName];

        let userDice = null;
        if (userRollInfo && Array.isArray(userRollInfo.dice) && userRollInfo.dice.length) {
            userDice = userRollInfo.dice.map(x => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1)))).slice(0, 2);
        }

        if (!userDice || !userDice.length) {
            const firstInfo = Object.values(result?.rolls || {}).find(v => Array.isArray(v?.dice) && v.dice.length);
            if (firstInfo) {
                userDice = firstInfo.dice.map(x => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1)))).slice(0, 2);
            }
        }

        const collisionVictims = Array.from(new Set(
            (result?.collisionMarks || [])
                .map(m => String(m?.victim || '').trim())
                .filter(Boolean)
        ));

        return {
            ok: true,
            packet,
            animation: {
                beforePositions,
                afterPositions,
                turnOrder: result.turnOrder || players,
                userDice: Array.isArray(userDice) && userDice.length ? userDice : [1],
                collisionVictims,
            },
        };
    }

    globalThis.FGR_ACTIONS = globalThis.FGR_ACTIONS || {};
    globalThis.FGR_ACTIONS.rollFlightByClick = rollFlightByClick;
    globalThis.FGR_ACTIONS.undoRound = undoRound;
    globalThis.FGR_ACTIONS.redoRound = redoRound;

    const c = ctx();
    c.eventSource.on(c.event_types.APP_READY, async () => {
        try {
            getSettings();
            await loadUiScript();
            globalThis.FGR_UI?.init({
                getSettings,
                getChatState,
                saveSettings: () => ctx().saveSettingsDebounced(),
                saveMetadata: () => ctx().saveMetadata(),
                validateFlightMapJson,
            });
            const syncRoundPromptFromState = () => {
                const st = getChatState();
                if (st?.pendingPacket) {
                    setRoundExtensionPrompt(buildInjectionText(st.pendingPacket));
                } else {
                    clearRoundExtensionPrompt();
                }
            };

            syncRoundPromptFromState();

            c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
                const s = getSettings();
                const ensured = ensureCharacterNamedProfile(s);
                if (ensured.changed) {
                    c.saveSettingsDebounced();
                }
                if (globalThis.FGR_UI?.refreshPlayerProfileUI) {
                    globalThis.FGR_UI.refreshPlayerProfileUI();
                }
                syncRoundPromptFromState();
            });
            await mountDrawerUI();
            bindLongPressOnExtensionsButton();
            console.log('[fair-game-referee] 初始化完成（外部判定+本地随机版）');
        } catch (e) {
            console.error('[fair-game-referee] 初始化失败', e);
        }
    });
})();
