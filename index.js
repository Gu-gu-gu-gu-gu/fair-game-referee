(() => {
    const MODULE_NAME = 'fair-game-referee';
    const CHARACTER_PROFILE_KEY = `${MODULE_NAME}_character_profile`;
    const EXT_PATH = '/scripts/extensions/third-party/fair-game-referee';
    const LONG_PRESS_MS = 550;
    const INLINE_ACTIONS_ENABLED = true;
    const INLINE_ACTION_WRAP_CLASS = 'fgr-inline-actions-wrap';
    const INLINE_ACTION_BTN_CLASS = 'fgr-inline-action-btn';
    const INLINE_NEXT_ROUND_BUTTON_CLASS = 'fgr-inline-next-round';
    const INLINE_START_FLIGHT_BUTTON_CLASS = 'fgr-inline-start-flight';
    const INLINE_START_KING_BUTTON_CLASS = 'fgr-inline-start-king';
    const QR_BOOTSTRAP_ENABLED = false;
    const QR_PRESET_NAME = 'FairGameRefereeAuto';
    const QR_LABEL_NEXT_ROUND = '下一回合';
    const QR_TITLE_NEXT_ROUND = '公平游戏裁判：推进一回合';
    const QR_TEXT_NEXT_ROUND = '下一回合';
    const QR_FALLBACK_WRAP_ID = 'fgr-qr-fallback-wrap';
    const QR_FALLBACK_BUTTON_ID = 'fgr-qr-fallback-next-round';

    let ludoCoreLoading = null;
    let ludoUiLoading = null;
    let ludoPromptLoading = null;
    let kingCoreLoading = null;
    let kingPromptLoading = null;

    function loadLudoUI() {
        if (ludoUiLoading) return ludoUiLoading;
        ludoUiLoading = $.getScript(`${EXT_PATH}/games/ludo/ludo-ui.js`);
        return ludoUiLoading;
    }

    async function ensureLudoUI() {
        try {
            await loadLudoUI();
        } catch (e) {
            console.error('[fair-game-referee] 加载飞行棋UI模块失败', e);
        }
    }

    function loadLudoCore() {
        if (ludoCoreLoading) return ludoCoreLoading;
        ludoCoreLoading = $.getScript(`${EXT_PATH}/games/ludo/ludo-core.js`);
        return ludoCoreLoading;
    }

    async function ensureLudoCore() {
        try {
            await loadLudoCore();
        } catch (e) {
            console.error('[fair-game-referee] 加载飞行棋模块失败', e);
        }
    }

    function loadLudoPrompt() {
        if (ludoPromptLoading) return ludoPromptLoading;
        ludoPromptLoading = $.getScript(`${EXT_PATH}/games/ludo/ludo-prompt.js`);
        return ludoPromptLoading;
    }

    async function ensureLudoPrompt() {
        try {
            await loadLudoPrompt();
        } catch (e) {
            console.error('[fair-game-referee] 加载飞行棋提示词模块失败', e);
        }
    }

    function loadKingCore() {
        if (kingCoreLoading) return kingCoreLoading;
        kingCoreLoading = $.getScript(`${EXT_PATH}/games/king/king-core.js`);
        return kingCoreLoading;
    }

    async function ensureKingCore() {
        try {
            await loadKingCore();
        } catch (e) {
            console.error('[fair-game-referee] 加载国王游戏核心模块失败', e);
        }
    }

    function loadKingPrompt() {
        if (kingPromptLoading) return kingPromptLoading;
        kingPromptLoading = $.getScript(`${EXT_PATH}/games/king/king-prompt.js`);
        return kingPromptLoading;
    }

    async function ensureKingPrompt() {
        try {
            await loadKingPrompt();
        } catch (e) {
            console.error('[fair-game-referee] 加载国王游戏提示词模块失败', e);
        }
    }

    const defaultSettings = Object.freeze({
        enabled: true,
        longPressOpenEnabled: true,

        manualPlayers: '',
        playerProfileLibraryJson: '{}',
        playerPoolByProfileJson: '{}',
        playerSelectedByProfileJson: '{}',
        activePlayerProfileName: '',
        includeUserDefault: false,
        userAliases: 'user',
        userCanonicalName: 'user',
        includeCharDefault: false,
        nameBlacklist: '旁白,系统,narrator,system,system note,gm,主持人',

        roundTriggerWords: '下一回合,新一回合,next round',
        flightStartKeywords: '飞行棋,玩飞行棋,开始玩飞行棋',
        kingStartKeywords: '国王游戏,玩国王游戏,开始玩国王游戏',

        diceCountMode: 'auto',
        diceFixedCount: 1,
        diceAutoSwitchPlayerCount: 6,
        clickAnimationMs: 2200,

        fairnessMode: 'strict',

        flightMapJson: JSON.stringify({ winPosition: 20, events: [] }, null, 2),
        mapLibraryJson: '',
    });

    let uiMounted = false;
    let longPressBound = false;
    let lpTimer = null;

    function ctx() {
        return SillyTavern.getContext();
    }

    function getSendTextarea() {
        return document.querySelector(
            '#send_textarea, #send_textarea_compact, textarea#send_textarea, textarea[id*="send_textarea"], #chat-input textarea'
        );
    }

    function setNativeInputValue(el, value) {
        const proto =
            el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function notifyInline(message, level = 'info') {
        if (typeof toastr !== 'undefined' && toastr) {
            if (level === 'success' && typeof toastr.success === 'function')
                toastr.success(message);
            else if (level === 'error' && typeof toastr.error === 'function') toastr.error(message);
            else if (typeof toastr.info === 'function') toastr.info(message);
            else console.log('[fair-game-referee]', message);
            return;
        }
        console.log('[fair-game-referee]', message);
    }

    function clickSendButton() {
        const btn = document.querySelector(
            '#send_but, #option_send, #send_form button[type="submit"], button.send_button, .send_button, button[title="Send"], button[aria-label="Send"], .fa-paper-plane'
        );
        if (btn && typeof btn.click === 'function') {
            btn.click();
            return true;
        }
        return false;
    }

    async function trySendByContextApi(text) {
        const c = ctx();
        if (!c) return false;

        const names = ['sendMessageAsUser', 'sendUserMessage', 'sendMessage'];
        for (const name of names) {
            const fn = c[name];
            if (typeof fn === 'function') {
                try {
                    const ret = await fn.call(c, text);
                    if (ret !== false) return true;
                } catch (e) {
                    console.warn(`[fair-game-referee] ${name} failed`, e);
                }
            }
        }
        return false;
    }

    async function trySendBySlash(text) {
        try {
            await runSlashQuiet(`/send ${quoteForSlashArg(text)}`);
            return true;
        } catch (e) {
            console.warn('[fair-game-referee] /send failed', e);
            return false;
        }
    }

    function trySendByDom(text) {
        const input = getSendTextarea();
        if (!input) return false;

        input.focus();
        setNativeInputValue(input, text);

        if (clickSendButton()) return true;

        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
            })
        );
        input.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
            })
        );
        return true;
    }

    let inlineNextRoundSending = false;

    async function advanceRoundInternally() {
        const state = getChatState();
        const gameType = normalizeGameType(
            state.currentGame || state.pendingPacket?.gameType || ''
        );

        if (!gameType) {
            return { ok: false, error: '请先开始飞行棋或国王游戏' };
        }

        if (gameType === 'flight') {
            return await rollFlightByClick({ resetMap: false });
        }

        if (gameType === 'king') {
            return await rollKingByClick();
        }

        return { ok: false, error: `不支持的游戏类型: ${gameType}` };
    }

    async function startFlightInternally() {
        return await rollFlightByClick({ resetMap: true });
    }

    async function startKingInternally() {
        return await rollKingByClick();
    }

    async function sendNextRoundMessageInline() {
        if (inlineNextRoundSending) return;
        inlineNextRoundSending = true;

        console.log('[fair-game-referee] inline next round trigger');

        try {
            const result = await advanceRoundInternally();

            if (result && result.ok) {
                const round = result?.packet?.round ?? getChatState().round ?? '';
                notifyInline(
                    round ? `已内部进入下一回合（第${round}回合）` : '已内部进入下一回合',
                    'success'
                );
                return;
            }

            notifyInline(`内部推进失败：${result?.error || '未知错误'}`, 'error');
        } catch (e) {
            console.error('[fair-game-referee] internal next round failed', e);
            notifyInline('内部推进失败：执行异常', 'error');
        } finally {
            setTimeout(() => {
                inlineNextRoundSending = false;
            }, 250);
        }
    }

    function createInlineActionButton(kind) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${INLINE_ACTION_BTN_CLASS} ${kind}`;
        btn.dataset.fgrAction = kind;

        if (kind === INLINE_NEXT_ROUND_BUTTON_CLASS) {
            btn.textContent = '⏭';
            btn.setAttribute('title', '下一回合');
            btn.setAttribute('aria-label', '下一回合');
        } else if (kind === INLINE_START_FLIGHT_BUTTON_CLASS) {
            btn.textContent = '✈';
            btn.setAttribute('title', '开始飞行棋');
            btn.setAttribute('aria-label', '开始飞行棋');
        } else if (kind === INLINE_START_KING_BUTTON_CLASS) {
            btn.textContent = '♚';
            btn.setAttribute('title', '开始国王游戏');
            btn.setAttribute('aria-label', '开始国王游戏');
        }

        btn.style.width = '24px';
        btn.style.height = '24px';
        btn.style.minWidth = '24px';
        btn.style.minHeight = '24px';
        btn.style.padding = '0';
        btn.style.border = 'none';
        btn.style.borderRadius = '7px';
        btn.style.cursor = 'pointer';
        btn.style.opacity = '0.96';
        btn.style.background = 'var(--SmartThemeBlurTintColor, rgba(255,255,255,0.14))';
        btn.style.color = 'var(--SmartThemeBodyColor, #fff)';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.fontSize = '13px';
        btn.style.lineHeight = '1';
        btn.style.boxShadow = 'none';
        btn.style.outline = 'none';
        btn.style.webkitTapHighlightColor = 'transparent';
        btn.style.backfaceVisibility = 'hidden';
        btn.style.transform = 'translateZ(0)';

        return btn;
    }

    function placeButtonLeftOfTarget(target) {
        if (!(target instanceof HTMLElement)) return;
        const parent = target.parentElement;
        if (!(parent instanceof HTMLElement)) return;

        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        let btn = parent.querySelector(`:scope > .${INLINE_NEXT_ROUND_BUTTON_CLASS}`);
        if (!(btn instanceof HTMLElement)) {
            btn = createInlineNextRoundButton();
            parent.appendChild(btn);
        }

        const tStyle = getComputedStyle(target);
        const top = target.offsetTop;
        const targetH = target.offsetHeight || 22;

        btn.style.top = `${top + Math.max(0, (targetH - 22) / 2)}px`;

        const rightVal = parseFloat(tStyle.right);
        if (Number.isFinite(rightVal)) {
            btn.style.right = `${rightVal + (target.offsetWidth || 18) + 8}px`;
            btn.style.left = '';
        } else {
            const left = Math.max(0, target.offsetLeft - 30);
            btn.style.left = `${left}px`;
            btn.style.right = '';
        }
    }

    function mountInlineNextRoundButtonNearSwipeRight(root = document) {
        if (!INLINE_ACTIONS_ENABLED) return;

        const oldWraps = document.querySelectorAll(`.${INLINE_ACTION_WRAP_CLASS}`);
        for (const old of oldWraps) old.remove();

        const mesList = Array.from(document.querySelectorAll('.mes'));
        const aiList = mesList.filter((el) => {
            if (!(el instanceof HTMLElement)) return false;
            if (el.classList.contains('is_user')) return false;
            if (el.classList.contains('system_message')) return false;
            if (el.getAttribute('is_user') === 'true') return false;
            return true;
        });

        if (!aiList.length) return;

        const lastAi = aiList[aiList.length - 1];
        const target = lastAi.querySelector(
            '.swipe_right.fa-solid.fa-chevron-right.interactable[role="button"]'
        );
        if (!(target instanceof HTMLElement)) return;

        const parent = target.parentElement;
        if (!(parent instanceof HTMLElement)) return;

        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        const wrap = document.createElement('div');
        wrap.className = INLINE_ACTION_WRAP_CLASS;
        wrap.dataset.fgrMountedFor = 'last-ai-only';
        wrap.style.position = 'absolute';
        wrap.style.zIndex = '1000';
        wrap.style.display = 'flex';
        wrap.style.gap = '6px';
        wrap.style.alignItems = 'center';
        wrap.style.pointerEvents = 'auto';

        const b1 = createInlineActionButton(INLINE_START_FLIGHT_BUTTON_CLASS);
        const b2 = createInlineActionButton(INLINE_START_KING_BUTTON_CLASS);
        const b3 = createInlineActionButton(INLINE_NEXT_ROUND_BUTTON_CLASS);

        for (const b of [b1, b2, b3]) {
            b.style.width = '28px';
            b.style.height = '28px';
            b.style.minWidth = '28px';
            b.style.minHeight = '28px';
            b.style.borderRadius = '8px';
            b.style.fontSize = '15px';
        }

        wrap.appendChild(b1);
        wrap.appendChild(b2);
        wrap.appendChild(b3);
        parent.appendChild(wrap);

        const targetTop = target.offsetTop;
        const targetH = target.offsetHeight || 28;
        const wrapH = wrap.offsetHeight || 28;

        const RIGHT_SAFE = 64;
        const TOP_OFFSET = -4;
        const baseTop = Math.max(0, targetTop + (targetH - wrapH) / 2);

        wrap.style.right = `${RIGHT_SAFE}px`;
        wrap.style.left = '';
        wrap.style.top = `${baseTop}px`;
        wrap.style.transform = `translateY(${TOP_OFFSET}px)`;
    }

    let inlineNextRoundGlobalClickBound = false;

    function bindInlineNextRoundGlobalClick() {
        if (inlineNextRoundGlobalClickBound) return;
        inlineNextRoundGlobalClickBound = true;

        const handler = async (e) => {
            const target =
                e.target instanceof Element
                    ? e.target.closest(`.${INLINE_ACTION_BTN_CLASS}`)
                    : null;
            if (!target) return;

            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

            const action = target.dataset.fgrAction || '';

            if (action === INLINE_NEXT_ROUND_BUTTON_CLASS) {
                await sendNextRoundMessageInline();
                return;
            }

            if (action === INLINE_START_FLIGHT_BUTTON_CLASS) {
                const r = await startFlightInternally();
                if (r?.ok) notifyInline('已开始飞行棋', 'success');
                else notifyInline(`飞行棋启动失败：${r?.error || '未知错误'}`, 'error');
                return;
            }

            if (action === INLINE_START_KING_BUTTON_CLASS) {
                const r = await startKingInternally();
                if (r?.ok) notifyInline('已开始国王游戏', 'success');
                else notifyInline(`国王游戏启动失败：${r?.error || '未知错误'}`, 'error');
            }
        };

        document.addEventListener('pointerdown', handler, true);
        document.addEventListener('click', handler, true);
    }

    let inlineNextRoundObserver = null;
    let inlineNextRoundScanTimer = null;

    function scheduleInlineNextRoundScan() {
        if (!INLINE_ACTIONS_ENABLED) return;
        if (inlineNextRoundScanTimer) clearTimeout(inlineNextRoundScanTimer);
        inlineNextRoundScanTimer = setTimeout(() => {
            requestAnimationFrame(() => {
                mountInlineNextRoundButtonNearSwipeRight(document);
            });
        }, 120);
    }

    function bindInlineNextRoundButton() {
        if (!INLINE_ACTIONS_ENABLED) return;
        bindInlineNextRoundGlobalClick();

        mountInlineNextRoundButtonNearSwipeRight(document);

        if (!inlineNextRoundObserver) {
            inlineNextRoundObserver = new MutationObserver(() => {
                scheduleInlineNextRoundScan();
            });
            inlineNextRoundObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
            });
        }

        const c = ctx();
        if (c && c.eventSource && c.eventTypes) {
            const rescan = () => scheduleInlineNextRoundScan();
            c.eventSource.on(c.eventTypes.APP_READY, rescan);
            c.eventSource.on(c.eventTypes.CHAT_CHANGED, rescan);
            c.eventSource.on(c.eventTypes.MESSAGE_RECEIVED, rescan);
            c.eventSource.on(c.eventTypes.MESSAGE_SWIPED, rescan);
        }

        setTimeout(() => mountInlineNextRoundButtonNearSwipeRight(document), 200);
        setTimeout(() => mountInlineNextRoundButtonNearSwipeRight(document), 1000);
    }

    function quoteForSlashArg(value) {
        return `"${String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')}"`;
    }

    async function runSlashQuiet(scriptText) {
        const c = ctx();
        if (typeof c.executeSlashCommandsWithOptions === 'function') {
            return await c.executeSlashCommandsWithOptions(scriptText, {
                handleAsChatMessage: false,
                scope: 'global',
            });
        }
        if (typeof c.executeSlashCommands === 'function') {
            return await c.executeSlashCommands(scriptText);
        }
        throw new Error('当前环境不支持 executeSlashCommands');
    }

    let qrBootstrapped = false;
    let qrBootstrapRunning = false;
    let qrBootstrapAttempts = 0;
    const QR_BOOTSTRAP_MAX_ATTEMPTS = 8;
    const QR_BOOTSTRAP_RETRY_MS = 1200;

    function getRegisteredSlashCommandNames() {
        const c = ctx();
        const p = c?.SlashCommandParser;
        if (!p) return new Set();

        const out = new Set();

        if (p.commands instanceof Map) {
            for (const k of p.commands.keys()) out.add(String(k));
        }

        if (Array.isArray(p.commands)) {
            for (const item of p.commands) {
                if (typeof item === 'string') out.add(item);
                else if (item && typeof item.name === 'string') out.add(item.name);
            }
        }

        if (Array.isArray(p.commandList)) {
            for (const item of p.commandList) {
                if (typeof item === 'string') out.add(item);
                else if (item && typeof item.name === 'string') out.add(item.name);
            }
        }

        if (typeof p.getCommands === 'function') {
            const list = p.getCommands();
            if (list instanceof Map) {
                for (const k of list.keys()) out.add(String(k));
            } else if (Array.isArray(list)) {
                for (const item of list) {
                    if (typeof item === 'string') out.add(item);
                    else if (item && typeof item.name === 'string') out.add(item.name);
                }
            }
        }

        return out;
    }

    function hasSlashCommand(name) {
        const names = getRegisteredSlashCommandNames();
        if (!names.size) return false;
        return names.has(name);
    }

    function sendTextViaInputBox(text) {
        const input = document.querySelector(
            '#send_textarea, textarea#send_textarea, #chat-input textarea, #send_textarea_compact'
        );
        if (!input) return false;

        input.focus();
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const sendBtn = document.querySelector(
            '#send_but, #option_send, .fa-paper-plane, .fa-solid.fa-paper-plane'
        );
        if (sendBtn && typeof sendBtn.click === 'function') {
            sendBtn.click();
            return true;
        }

        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
            })
        );
        return true;
    }

    async function sendNextRoundMessage() {
        const ok = sendTextViaInputBox(QR_TEXT_NEXT_ROUND);
        if (ok) return;

        try {
            await runSlashQuiet(`/send ${quoteForSlashArg(QR_TEXT_NEXT_ROUND)}`);
        } catch (e) {
            console.error('[fair-game-referee] send next round failed', e);
        }
    }

    function ensureFallbackQuickButton() {
        const host = document.querySelector('#qr_container');
        if (!host) return false;

        let wrap = document.getElementById(QR_FALLBACK_WRAP_ID);
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = QR_FALLBACK_WRAP_ID;
            wrap.style.display = 'flex';
            wrap.style.flexWrap = 'wrap';
            wrap.style.gap = '6px';
            wrap.style.marginTop = '6px';
            host.appendChild(wrap);
        }

        let btn = document.getElementById(QR_FALLBACK_BUTTON_ID);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = QR_FALLBACK_BUTTON_ID;
            btn.type = 'button';
            btn.className = 'menu_button interactable';
            btn.textContent = QR_LABEL_NEXT_ROUND;
            btn.title = QR_TITLE_NEXT_ROUND;
            btn.style.minHeight = '28px';
            btn.style.padding = '4px 10px';
            btn.addEventListener('click', () => {
                sendNextRoundMessage();
            });
            wrap.appendChild(btn);
        } else {
            btn.textContent = QR_LABEL_NEXT_ROUND;
            btn.title = QR_TITLE_NEXT_ROUND;
        }

        return true;
    }

    async function ensureQuickReplyButtons() {
        if (!QR_BOOTSTRAP_ENABLED) return false;
        if (qrBootstrapped) return true;
        if (qrBootstrapRunning) return false;

        qrBootstrapRunning = true;

        const c = ctx();
        if (!c) {
            qrBootstrapRunning = false;
            return false;
        }

        const hasQrCreate = hasSlashCommand('qr-create');
        const hasQrPresetAdd = hasSlashCommand('qr-presetadd');
        const hasQrSet = hasSlashCommand('qrset');

        if (!hasQrCreate || !hasQrPresetAdd || !hasQrSet) {
            const ok = ensureFallbackQuickButton();
            if (ok) {
                qrBootstrapped = true;
                qrBootstrapRunning = false;
                return true;
            }
            qrBootstrapRunning = false;
            return false;
        }

        const preset = quoteForSlashArg(QR_PRESET_NAME);
        const label = quoteForSlashArg(QR_LABEL_NEXT_ROUND);
        const title = quoteForSlashArg(QR_TITLE_NEXT_ROUND);
        const text = quoteForSlashArg(QR_TEXT_NEXT_ROUND);

        let buttonReady = false;

        try {
            await runSlashQuiet(`/qr-presetadd enabled=true inject=false slots=6 ${preset}`);
        } catch (e) {
            console.warn('[fair-game-referee] qr-presetadd failed', e);
        }

        try {
            await runSlashQuiet(
                `/qr-create set=${preset} label=${label} hidden=false title=${title} ${text}`
            );
            buttonReady = true;
        } catch (e) {
            console.error('[fair-game-referee] qr-create failed', e);
        }

        if (buttonReady) {
            try {
                await runSlashQuiet(`/qrset ${preset}`);
            } catch (e) {
                console.warn('[fair-game-referee] qrset failed', e);
            }
            c.saveSettingsDebounced();
            qrBootstrapped = true;
        }

        qrBootstrapRunning = false;
        return qrBootstrapped;
    }

    async function bootstrapQuickReplyWithRetry() {
        if (!QR_BOOTSTRAP_ENABLED) return;
        if (qrBootstrapped) return;
        qrBootstrapAttempts += 1;

        const ok = await ensureQuickReplyButtons();
        if (ok) return;

        if (qrBootstrapAttempts < QR_BOOTSTRAP_MAX_ATTEMPTS) {
            setTimeout(bootstrapQuickReplyWithRetry, QR_BOOTSTRAP_RETRY_MS);
        } else {
            console.error('[fair-game-referee] QR bootstrap exhausted retries');
        }
    }

    function bindQuickReplyBootstrap() {
        const c = ctx();
        if (!c || !c.eventSource || !c.eventTypes) return;

        const bootstrap = async () => {
            await bootstrapQuickReplyWithRetry();
        };

        c.eventSource.on(c.eventTypes.APP_READY, bootstrap);
        c.eventSource.on(c.eventTypes.EXTENSIONS_FIRST_LOAD, bootstrap);
        c.eventSource.on(c.eventTypes.SETTINGS_LOADED_AFTER, bootstrap);
        c.eventSource.on(c.eventTypes.CHAT_CHANGED, bootstrap);

        bootstrap();
        setTimeout(bootstrap, 800);
    }

    function parseList(text) {
        return String(text || '')
            .split(/[\n,，]/g)
            .map((x) => x.trim())
            .filter(Boolean);
    }

    function normalizeName(name) {
        return String(name || '')
            .trim()
            .toLowerCase();
    }
    function makeLowerSet(text) {
        return new Set(parseList(text).map(normalizeName));
    }
    function roll(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function clampInt(n, min, max, fallback) {
        const x = Math.trunc(Number(n));
        if (!Number.isFinite(x)) return fallback;
        return Math.min(max, Math.max(min, x));
    }

    // ===== 修复点1：更强的模式归一化，兼容旧值/脏值 =====
    function normalizeDiceMode(raw) {
        const x = String(raw || '')
            .trim()
            .toLowerCase();
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
if (typeof s.playerPoolByProfileJson !== 'string' || !s.playerPoolByProfileJson.trim()) {
    s.playerPoolByProfileJson = '{}';
}
if (typeof s.playerSelectedByProfileJson !== 'string' || !s.playerSelectedByProfileJson.trim()) {
    s.playerSelectedByProfileJson = '{}';
}
if (typeof s.activePlayerProfileName !== 'string') {
    s.activePlayerProfileName = '';
}

        if (typeof s.kingStartKeywords !== 'string') {
            s.kingStartKeywords = defaultSettings.kingStartKeywords;
        }

        s.clickAnimationMs = clampInt(s.clickAnimationMs, 800, 6000, 2200);
// 强制：不自动注入 user/char，且 user 统一固定
s.includeUserDefault = false;
s.includeCharDefault = false;
s.userCanonicalName = 'user';

// 兼容旧配置：别名里至少保留 user
const ua = String(s.userAliases || '').trim();
s.userAliases = ua ? ua : 'user';
    }

    function getSettings() {
        const c = ctx();
        if (!c.extensionSettings[MODULE_NAME])
            c.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        for (const k of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(c.extensionSettings[MODULE_NAME], k))
                c.extensionSettings[MODULE_NAME][k] = defaultSettings[k];
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
                king: { presetUserCard: null },
                lastResult: null,
                pendingPacket: null,
                lastHandledUserFingerprint: '',
                turnOrder: [],
                historyStack: [],
                futureStack: [],
            };
        }

        if (
            !c.chatMetadata[MODULE_NAME].king ||
            typeof c.chatMetadata[MODULE_NAME].king !== 'object'
        ) {
            c.chatMetadata[MODULE_NAME].king = { presetUserCard: null };
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
            flight:
                state.flight && typeof state.flight === 'object' ? state.flight : { positions: {} },
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
            return { ok: false, error: '没有可回退的上一回合' };
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
            return { ok: false, error: '没有可前进的下一回合' };
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

    async function setRoundNumber(newRound, options = {}) {
        const c = ctx();
        const state = getChatState();

        const nr = clampInt(newRound, 0, 9999, state.round || 0);
        if (nr === state.round) {
            return {
                ok: true,
                round: state.round,
                gameType: state.currentGame,
            };
        }

        pushRoundHistorySnapshot(state);

        state.round = nr;

        if (state.pendingPacket) {
            state.pendingPacket.round = nr;
            if (options.clearOverride) {
                state.pendingPacket.overrideText = null;
            }
        }

        if (state.lastResult && typeof state.lastResult === 'object') {
            state.lastResult.round = nr;
        }

        if (state.pendingPacket) {
            const text =
                state.pendingPacket.overrideText || buildInjectionText(state.pendingPacket);
            setRoundExtensionPrompt(text);
        } else {
            clearRoundExtensionPrompt();
        }

        await c.saveMetadata();
        return { ok: true, round: state.round, gameType: state.currentGame };
    }

    async function setPlayerPositions(posMap = {}) {
        const c = ctx();
        const s = getSettings();
        const state = getChatState();

        await ensureLudoCore();

        if (!posMap || typeof posMap !== 'object') {
            return { ok: false, error: '位置数据无效' };
        }

        pushRoundHistorySnapshot(state);

        if (!state.flight || typeof state.flight !== 'object') {
            state.flight = { positions: {} };
        }
        if (!state.flight.positions || typeof state.flight.positions !== 'object') {
            state.flight.positions = {};
        }

        const map = parseFlightMap(s);
        const win = Math.max(1, Math.trunc(Number(map.winPosition) || 20));
        const startCell = getMapStartCell(map);

        for (const name in posMap) {
            if (!Object.prototype.hasOwnProperty.call(posMap, name)) continue;
            const raw = posMap[name];
            const v = Math.trunc(Number(raw));
            if (!Number.isFinite(v)) continue;

            let fixed = v;
            if (fixed < startCell) fixed = startCell;
            if (fixed > win) fixed = win;

            state.flight.positions[name] = fixed;
        }

        await c.saveMetadata();
        return { ok: true };
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
        const words = parseList(csvWords)
            .map((w) => w.toLowerCase())
            .filter(Boolean);
        return words.some((w) => textLower.includes(w));
    }

    function normalizeGameType(input) {
        const x = String(input || '')
            .trim()
            .toLowerCase();
        if (!x) return '';
        if (['flight', 'flying_chess', 'feixingqi', '飞行棋'].includes(x)) return 'flight';
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
            if (!Number.isFinite(Number(map.winPosition)))
                return { ok: false, error: 'winPosition 必须是数字' };
            if (!Array.isArray(map.events)) return { ok: false, error: 'events 必须是数组' };
            return { ok: true, map };
        } catch (err) {
            return { ok: false, error: `JSON解析失败: ${err.message}` };
        }
    }

    function parseFlightMap(settings) {
        const core = globalThis.FGR_LUDO_CORE;
        if (core && typeof core.parseFlightMap === 'function') return core.parseFlightMap(settings);

        const checked = validateFlightMapJson(settings.flightMapJson);
        return checked.ok ? checked.map : { winPosition: 20, events: [] };
    }

    function getMapStartCell(map) {
        const core = globalThis.FGR_LUDO_CORE;
        if (core && typeof core.getMapStartCell === 'function') return core.getMapStartCell(map);

        const events = Array.isArray(map?.events) ? map.events : [];
        const hasZero = events.some((e) => Math.trunc(Number(e?.at)) === 0);
        return hasZero ? 0 : 1;
    }

function getCurrentCharacterName() {
    const c = ctx();

    const chid = Number(c.characterId);
    if (Number.isInteger(chid) && chid >= 0) {
        const byCard = String(c.characters?.[chid]?.name || '').trim();
        if (byCard) return byCard;
    }

    const byName2 = String(c.name2 || '').trim();
    if (byName2) return byName2;

    return '';
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

function parseProfileNameMap(raw) {
    let obj = {};
    try {
        obj = JSON.parse(String(raw || '{}'));
    } catch (_e) {
        obj = {};
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};

    for (const k of Object.keys(obj)) {
        if (!Array.isArray(obj[k])) {
            obj[k] = [];
            continue;
        }
        const out = [];
        const seen = new Set();
        for (const v of obj[k]) {
            const n = String(v || '').trim();
            const key = normalizeName(n);
            if (!key) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(n);
        }
        obj[k] = out;
    }

    return obj;
}

function getPlayerPoolByProfile(settings) {
    return parseProfileNameMap(settings.playerPoolByProfileJson);
}

function setPlayerPoolByProfile(settings, map) {
    settings.playerPoolByProfileJson = JSON.stringify(map);
}

function getPlayerSelectedByProfile(settings) {
    return parseProfileNameMap(settings.playerSelectedByProfileJson);
}

function setPlayerSelectedByProfile(settings, map) {
    settings.playerSelectedByProfileJson = JSON.stringify(map);
}

function getSelectedPlayersForActiveProfile(settings) {
    const active = String(settings.activePlayerProfileName || '').trim();
    if (!active) return [];

    const poolMap = getPlayerPoolByProfile(settings);
    const selectedMap = getPlayerSelectedByProfile(settings);

    const pool = Array.isArray(poolMap[active]) ? poolMap[active] : [];
    const selected = Array.isArray(selectedMap[active]) ? selectedMap[active] : [];

    if (!pool.length && !selected.length) {
        return parseList(getEffectiveManualPlayers(settings));
    }

    const poolKeySet = new Set(pool.map((x) => normalizeName(x)));
    const out = [];
    const seen = new Set();

    for (const n of selected) {
        const t = String(n || '').trim();
        const key = normalizeName(t);
        if (!key) continue;
        if (!poolKeySet.has(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
    }

    return out;
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
            const fallback =
                String(settings.activePlayerProfileName || '默认名单').trim() || '默认名单';
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
    const fromProfile = String(ensured.lib[active] || '');
    if (fromProfile.trim()) return fromProfile;

    // 兼容旧版本：如果当前profile为空，回退到老字段 manualPlayers
    return String(settings.manualPlayers || '');
}

function resolvePlayers(settings, chat, name1, name2, suggestedPlayers = []) {
    const userAliasSet = makeLowerSet(settings.userAliases);
    const blacklistSet = makeLowerSet(settings.nameBlacklist);
    const canonical = 'user';
    const map = new Map();

    const push = (raw) => {
        let n = String(raw || '').trim();
        if (!n) return;

        let key = normalizeName(n);
        if (blacklistSet.has(key)) return;

        if (userAliasSet.has(key)) n = canonical;

        key = normalizeName(n);
        if (!key) return;
        if (!map.has(key)) map.set(key, n);
    };

    getSelectedPlayersForActiveProfile(settings).forEach(push);
    (Array.isArray(suggestedPlayers) ? suggestedPlayers : []).forEach(push);

    return Array.from(map.values());
}

    function samePlayers(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        const sa = a.map(normalizeName).sort().join('|');
        const sb = b.map(normalizeName).sort().join('|');
        return sa === sb;
    }

    function detectRoundTriggerLocal(text, settings, currentGame) {
        const t = String(text || '');
        const lower = t.toLowerCase();

        const roundWords =
            String(settings.roundTriggerWords || '').trim() || defaultSettings.roundTriggerWords;
        const hasRoundWord = includesAny(lower, roundWords);

        const isFlightStart = includesAny(lower, settings.flightStartKeywords);
        const isFlightReplay = includesAny(lower, settings.flightReplayKeywords);
        const isKingStart = includesAny(lower, settings.kingStartKeywords);

        if (isFlightStart) {
            return {
                startNewRound: true,
                gameType: 'flight',
                resetMap: isFlightReplay,
                reason: 'flight_start_local',
                playersSuggested: [],
            };
        }

        if (isKingStart) {
            return {
                startNewRound: true,
                gameType: 'king',
                resetMap: false,
                reason: 'king_start_local',
                playersSuggested: [],
            };
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

        return {
            startNewRound: false,
            gameType: currentGame || '',
            resetMap: false,
            reason: 'none_local',
            playersSuggested: [],
        };
    }

    function runRound(gameType, players, state, settings) {
        if (gameType === 'flight') {
            const core = globalThis.FGR_LUDO_CORE;
            if (!core || typeof core.runFlightRound !== 'function') {
                return {
                    rows: [],
                    summary: '飞行棋模块未加载',
                    cellTexts: [],
                    turnOrder: [],
                    collisionTexts: [],
                    collisionMarks: [],
                    winners: [],
                };
            }
            return core.runFlightRound({
                players,
                state,
                settings,
                resolveDiceCount,
                samePlayers,
                roll,
            });
        }

        if (gameType === 'king') {
            const core = globalThis.FGR_KING_CORE;
            if (!core || typeof core.runKingRound !== 'function') {
                return {
                    rows: [],
                    summary: '国王游戏模块未加载',
                    cellTexts: [],
                    turnOrder: [],
                    collisionTexts: [],
                    collisionMarks: [],
                    winners: [],
                    king: null,
                };
            }
            return core.runKingRound({
                players,
                state,
                settings,
                roll,
            });
        }

        return {
            rows: [],
            summary: '当前仅实现：飞行棋 / 国王游戏。',
            cellTexts: [],
            turnOrder: [],
            collisionTexts: [],
            collisionMarks: [],
            winners: [],
        };
    }

    function buildFlightDetailLinesFromTurns(turns = []) {
        return turns.map((t) => {
            const dice = Array.isArray(t.dice) ? t.dice : [];
            const total = Number.isFinite(Number(t.total))
                ? Number(t.total)
                : dice.reduce((a, b) => a + b, 0);
            const diceText = dice.length
                ? dice.length === 1
                    ? String(dice[0])
                    : `${dice.join('+')}=${total}`
                : '';
            const eventText = String(t.eventText || t.finalCellText || '').trim();
            const orderText = Number.isFinite(Number(t.order)) ? `顺位${t.order}，` : '';
            const rollText = diceText ? `掷出${diceText}，` : '';
            const finalPos = Number.isFinite(Number(t.finalPos))
                ? Math.trunc(Number(t.finalPos))
                : '';
            const eventPart = eventText ? `，事件:${eventText}` : '';
            return `${t.player}: ${orderText}${rollText}落点${finalPos}${eventPart}`.trim();
        });
    }

    function buildDetailLines(gameType, result) {
        if (gameType === 'flight' && Array.isArray(result?.turns)) {
            return buildFlightDetailLinesFromTurns(result.turns);
        }
        if (Array.isArray(result?.rows)) {
            return result.rows.map((r) => `${r.player}:${r.value}`);
        }
        return [];
    }

    function getEventTextByPos(map, pos) {
        const events = Array.isArray(map?.events) ? map.events : [];
        const p = Math.trunc(Number(pos));
        const hit = events.find((e) => Math.trunc(Number(e?.at)) === p);
        return String(hit?.text || '').trim();
    }

    function rebuildFlightPacketByPositions(state, settings, players) {
        const map = parseFlightMap(settings);
        const win = Math.max(1, Math.trunc(Number(map.winPosition) || 20));
        const startCell = getMapStartCell(map);
        const diceCount = resolveDiceCount(settings, players.length);

        const order =
            Array.isArray(state.pendingPacket?.turnOrder) && state.pendingPacket.turnOrder.length
                ? state.pendingPacket.turnOrder
                : Array.isArray(state.turnOrder) && state.turnOrder.length
                  ? state.turnOrder
                  : players;

        const baseTurns = Array.isArray(state?.lastResult?.result?.turns)
            ? state.lastResult.result.turns
            : [];
        const turns = order.map((name, idx) => {
            const base = baseTurns.find((t) => t.player === name) || {};
            const pos = Math.trunc(Number(state.flight?.positions?.[name] ?? startCell));
            const eventText = getEventTextByPos(map, pos);
            return {
                player: name,
                order: idx + 1,
                dice: Array.isArray(base.dice) ? base.dice : [],
                total: Number.isFinite(Number(base.total)) ? Number(base.total) : 0,
                landedByDice: base.landedByDice,
                eventMove: base.eventMove,
                eventText: eventText,
                finalPos: pos,
                finalCellText: eventText,
            };
        });

        const detailLines = buildFlightDetailLinesFromTurns(turns);
        const detail = detailLines.join('；');

        const winners = turns.filter((t) => t.finalPos === win).map((t) => t.player);
        const summary = `终点${win}；起点${startCell}；骰子=${diceCount}d6；到达终点：${winners.length ? winners.join(' / ') : '暂无'}`;

        const cellTexts = turns
            .map((t) => {
                const text = String(t.eventText || '').trim();
                if (!text) return '';
                return `${t.player}@格${t.finalPos}:${text}`;
            })
            .filter(Boolean);

        return {
            packetId:
                state.pendingPacket?.packetId ||
                `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: 'flight',
            round: state.round,
            players: players,
            detail,
            detailLines,
            summary,
            cellTexts,
            turnOrder: order,
            collisionTexts: Array.isArray(state.pendingPacket?.collisionTexts)
                ? state.pendingPacket.collisionTexts
                : [],
            winners,
            turns,
            createdAt: state.pendingPacket?.createdAt || Date.now(),
        };
    }

    async function applyDirectorEdits(posMap = {}) {
        const c = ctx();
        const s = getSettings();
        const state = getChatState();
        await ensureLudoCore();

        if (!state.pendingPacket || state.pendingPacket.gameType !== 'flight') {
            return { ok: false, error: '当前没有可编辑的飞行棋回合包' };
        }

        const players = Array.isArray(state.pendingPacket.players)
            ? state.pendingPacket.players
            : [];
        if (!state.flight || typeof state.flight !== 'object') state.flight = { positions: {} };
        if (!state.flight.positions || typeof state.flight.positions !== 'object')
            state.flight.positions = {};

        const map = parseFlightMap(s);
        const win = Math.max(1, Math.trunc(Number(map.winPosition) || 20));
        const startCell = getMapStartCell(map);

        for (const name in posMap) {
            if (!Object.prototype.hasOwnProperty.call(posMap, name)) continue;
            const v = Math.trunc(Number(posMap[name]));
            if (!Number.isFinite(v)) continue;
            let fixed = v;
            if (fixed < startCell) fixed = startCell;
            if (fixed > win) fixed = win;
            state.flight.positions[name] = fixed;
        }

        const packet = rebuildFlightPacketByPositions(state, s, players);

        state.pendingPacket = packet;
        if (state.lastResult && state.lastResult.result) {
            state.lastResult.result.turns = packet.turns;
        }

        const text = buildInjectionText(packet);
        setRoundExtensionPrompt(text);

        await c.saveMetadata();
        return { ok: true, packet };
    }

    function isFgrPacketSystemNote(m) {
        return !!(
            m &&
            !m.is_user &&
            String(m.name || '') === 'System Note' &&
            typeof m.mes === 'string' &&
            m.mes.includes('【游戏裁定-回合包】')
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

    function buildGenericInjectionText(packet) {
        const detailText =
            Array.isArray(packet.detailLines) && packet.detailLines.length
                ? packet.detailLines.join('；')
                : String(packet.detail || '');

        const orderLine =
            packet.turnOrder && packet.turnOrder.length
                ? `顺序=${packet.turnOrder.join(' -> ')}`
                : '顺序=无';

        return [
            `【游戏裁定-回合包】【${packet.gameType}】第${packet.round}回合`,
            `玩家=${packet.players.join('、')}`,
            orderLine,
            `回合提要=${detailText || '无'}`,
            `结论=${packet.summary || '无'}`,
            `【强约束】你必须严格按上述结果叙事，不得改判。`,
            `【禁止自动开新回合】除非用户明确说“下一回合/新回合/next round”，否则不得进入下一回合。`,
        ].join('\n');
    }

    function buildInjectionText(packet) {
        const gt = normalizeGameType(packet?.gameType || '');

        if (gt === 'flight') {
            const mod = globalThis.FGR_LUDO_PROMPT;
            if (mod && typeof mod.buildPrompt === 'function') {
                return mod.buildPrompt(packet);
            }
        }

        if (gt === 'king') {
            const mod = globalThis.FGR_KING_PROMPT;
            if (mod && typeof mod.buildPrompt === 'function') {
                return mod.buildPrompt(packet);
            }
        }

        return buildGenericInjectionText(packet);
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
            if (packet.gameType === 'flight') {
                if (globalThis.FGR_UI?.openDirectorOnlyModal) {
                    globalThis.FGR_UI.openDirectorOnlyModal();
                } else if (globalThis.FGR_UI?.open) {
                    globalThis.FGR_UI.open('map');
                }
                toastr.info('[游戏裁定] 已打开飞行棋导演面板，请调整落点并应用');
            } else if (packet.gameType === 'king') {
                if (globalThis.FGR_UI?.openKingDirectorModal) {
                    globalThis.FGR_UI.openKingDirectorModal(packet);
                } else if (globalThis.FGR_UI?.open) {
                    globalThis.FGR_UI.open('card');
                }
                toastr.info('[游戏裁定] 已打开国王游戏导演面板，请指定牌面与玩家对应');
            }
        }

const finalText = packet.overrideText || injectText;

// 关键：回写，避免后续链路里 pendingPacket 没带 overrideText 导致不同步
packet.overrideText = finalText;

setRoundExtensionPrompt(finalText);
return finalText;
    }

    globalThis.fairGameRefereeInterceptor = async function (chat, contextSize, abort, type) {
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

        const currentGame = state.currentGame || state.pendingPacket?.gameType || '';
        if (!state.currentGame && currentGame) {
            state.currentGame = currentGame;
        }
        const decision = detectRoundTriggerLocal(text, s, currentGame);

        if (!decision.startNewRound) {
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        if (!decision.gameType) {
            toastr.warning('"[游戏裁定] 尚未确定游戏类型（先说一次“飞行棋/国王游戏”等）"');
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        const players = resolvePlayers(
            s,
            c.chat,
            c.name1,
            c.name2,
            decision.playersSuggested || []
        );
        if (players.length < 2) {
            toastr.warning(`[游戏裁定] 玩家少于2人，当前识别到：${players.join('、') || '无'}`);
            state.lastHandledUserFingerprint = fp;
            await c.saveMetadata();
            return;
        }

        pushRoundHistorySnapshot(state);

        if (decision.gameType === 'flight') {
            await ensureLudoCore();
        }
        if (decision.gameType === 'king') {
            await ensureKingCore();
        }

        if (decision.gameType !== state.currentGame) {
            state.currentGame = decision.gameType;
            state.round = 0;
            state.turnOrder = [];
            if (decision.gameType === 'flight') state.flight = { positions: {} };
        }

        if (decision.gameType === 'flight' && decision.resetMap) {
            state.flight = { positions: {} };
            state.round = 0;
            state.turnOrder = [];
            state.pendingPacket = null;
            clearRoundExtensionPrompt();
        }

        state.round += 1;
        const result = runRound(state.currentGame, players, state, s);
        const detailLines = buildDetailLines(state.currentGame, result);
        const detail = detailLines.join('；');

        const packet = {
            packetId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: state.currentGame,
            round: state.round,
            players,
            detail,
            detailLines,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            turns: result.turns || [],
            king: result.king || null,
            createdAt: Date.now(),
        };

        removeFgrPacketSystemNotes(chat);
        await applyPacketToChat(chat, packet, s);

        state.players = players;
        state.lastResult = {
            gameType: state.currentGame,
            round: state.round,
            result,
        };
        state.pendingPacket = packet;
        state.lastHandledUserFingerprint = fp;

        await c.saveMetadata();
        toastr.success(`[游戏裁定] ${state.currentGame} 第${state.round}回合已裁定`);
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
                    toastr.warning('[游戏裁定] 面板未就绪，请稍后再试');
                }
            }, LONG_PRESS_MS);
        });

        $(document).on(
            'mouseup.fgr mouseleave.fgr touchend.fgr touchcancel.fgr',
            '#extensionsMenuButton',
            clear
        );
        longPressBound = true;
    }

    function bindIfExists(selector, binder) {
        const $el = $(selector);
        if ($el.length) binder($el);
    }

    function bindDrawerUI() {
        const c = ctx();
        const s = getSettings();

        bindIfExists('#fgr-enabled', ($el) => {
            $el.prop('checked', !!s.enabled).on('change', (e) => {
                s.enabled = !!$(e.target).prop('checked');
                c.saveSettingsDebounced();
            });
        });

        bindIfExists('#fgr-longpress-enabled', ($el) => {
            $el.prop('checked', !!s.longPressOpenEnabled).on('change', (e) => {
                s.longPressOpenEnabled = !!$(e.target).prop('checked');
                c.saveSettingsDebounced();
            });
        });

        bindIfExists('#fgr-open-panel', ($el) => {
            $el.off('click').on('click', () => {
                if (globalThis.FGR_UI?.open) {
                    globalThis.FGR_UI.open('settings');
                } else {
                    toastr.warning('[游戏裁定] 面板未就绪，请稍后重试');
                }
            });
        });
    }

    async function mountDrawerUI() {
        if (uiMounted) return;
        const html = await $.get(`${EXT_PATH}/settings.html`);
        $('#extensions_settings').append(html);

        // ✅ 默认折叠
        const $drawer = $('#fair-game-referee-settings');
        $drawer.removeClass('open');
        $drawer.find('.inline-drawer-content').hide();

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
        await ensureLudoCore();
        const resetMap = !!options.resetMap;

        if (!s.enabled) return { ok: false, error: '插件未启用' };

        const players = resolvePlayers(s, c.chat, c.name1, c.name2, []);
        if (players.length < 2) {
            return {
                ok: false,
                error: `玩家少于2人：${players.join('、') || '无'}`,
            };
        }

        pushRoundHistorySnapshot(state);

        state.currentGame = 'flight';
        if (!state.flight || typeof state.flight !== 'object') state.flight = { positions: {} };

        if (resetMap) {
            state.round = 0;
            state.turnOrder = [];
            state.flight = { positions: {} };
            state.pendingPacket = null;
            clearRoundExtensionPrompt();
            removeFgrPacketSystemNotes(c.chat);
        }

        const beforePositions = clonePlain(state.flight.positions);
        state.round += 1;

        const result = runRound('flight', players, state, s);
        const afterPositions = clonePlain(state.flight.positions);

        const detailLines = buildDetailLines('flight', result);
        const detail = detailLines.join('；');
        const packet = {
            packetId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: 'flight',
            round: state.round,
            players,
            detail,
            detailLines,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            turns: result.turns || [],
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
            userDice = userRollInfo.dice
                .map((x) => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1))))
                .slice(0, 2);
        }

        if (!userDice || !userDice.length) {
            const firstInfo = Object.values(result?.rolls || {}).find(
                (v) => Array.isArray(v?.dice) && v.dice.length
            );
            if (firstInfo) {
                userDice = firstInfo.dice
                    .map((x) => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1))))
                    .slice(0, 2);
            }
        }

        const collisionVictims = Array.from(
            new Set(
                (result?.collisionMarks || [])
                    .map((m) => String(m?.victim || '').trim())
                    .filter(Boolean)
            )
        );

        return {
            ok: true,
            packet,
            animation: {
                beforePositions,
                afterPositions,
                turnOrder: result.turnOrder || players,
                userDice: Array.isArray(userDice) && userDice.length ? userDice : [1],
                collisionVictims,
                turns: Array.isArray(result.turns) ? result.turns : [],
                collisionMarks: Array.isArray(result.collisionMarks) ? result.collisionMarks : [],
            },
        };
    }

    async function getResolvedPlayersForUI() {
        const c = ctx();
        const s = getSettings();
        const players = resolvePlayers(s, c.chat, c.name1, c.name2, []);
        return { ok: true, players };
    }

    async function rollKingByClick() {
        const c = ctx();
        const s = getSettings();
        const state = getChatState();

        await ensureKingCore();

        if (!s.enabled) return { ok: false, error: '插件未启用' };

        const players = resolvePlayers(s, c.chat, c.name1, c.name2, []);
        if (players.length < 2) {
            return {
                ok: false,
                error: `玩家少于2人：${players.join('、') || '无'}`,
            };
        }

        pushRoundHistorySnapshot(state);

        if (state.currentGame !== 'king') {
            state.currentGame = 'king';
            state.round = 0;
            state.turnOrder = [];
        }

        state.round += 1;
        const result = runRound('king', players, state, s);
        const detailLines = buildDetailLines('king', result);
        const detail = detailLines.join('；');

        const packet = {
            packetId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            gameType: 'king',
            round: state.round,
            players,
            detail,
            detailLines,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            turns: result.turns || [],
            king: result.king || null,
            createdAt: Date.now(),
        };

        await applyPacketToChat(c.chat, packet, s, { appendToEnd: true });

        state.players = players;
        state.lastResult = { gameType: 'king', round: state.round, result };
        state.pendingPacket = packet;

        await c.saveMetadata();
        toastr.success(`[游戏裁定] king 第${state.round}回合已裁定`);
        return { ok: true, packet };
    }

    async function setKingPresetUserCard(card) {
        const c = ctx();
        const state = getChatState();
        state.king = state.king || {};
        state.king.presetUserCard = String(card || '').trim() || null;
        await c.saveMetadata();
        return { ok: true, card: state.king.presetUserCard };
    }

    async function applyKingDirectorEdits(assignments) {
        const c = ctx();
        const s = getSettings();
        const state = getChatState();

        if (!state.pendingPacket || state.pendingPacket.gameType !== 'king') {
            return { ok: false, error: '当前没有可编辑的国王游戏回合包' };
        }

        const players = Array.isArray(state.pendingPacket.players)
            ? state.pendingPacket.players
            : [];
        if (!players.length) {
            return { ok: false, error: '回合包中没有玩家信息' };
        }

        const core = globalThis.FGR_KING_CORE;
        if (!core || typeof core.runKingRound !== 'function') {
            return {
                ok: false,
                error: '国王游戏核心模块未加载',
            };
        }

        // 直接用导演指定的 assignmentsOverride 重算本回合
        const result = core.runKingRound({
            players,
            state,
            settings: s,
            roll,
            assignmentsOverride: Array.isArray(assignments) ? assignments : [],
        });

        const detailLines = buildDetailLines('king', result);
        const detail = detailLines.join('；');

        const packet = {
            ...state.pendingPacket,
            gameType: 'king',
            detail,
            detailLines,
            summary: result.summary,
            cellTexts: result.cellTexts || [],
            turnOrder: result.turnOrder || [],
            collisionTexts: result.collisionTexts || [],
            winners: result.winners || [],
            turns: result.turns || [],
            king: result.king || null,
        };

        state.pendingPacket = packet;
        state.lastResult = {
            gameType: 'king',
            round: state.round,
            result,
        };

        const text = buildInjectionText(packet);
        setRoundExtensionPrompt(text);

        await c.saveMetadata();
        return { ok: true, packet };
    }

    async function resetKingProgress() {
        const c = ctx();
        const state = getChatState();

        pushRoundHistorySnapshot(state);

        state.currentGame = 'king';
        state.round = 0;
        state.turnOrder = [];
        state.pendingPacket = null;
        state.lastResult = null;
        state.players = [];
        state.king = state.king || {};
        state.king.presetUserCard = null;

        clearRoundExtensionPrompt();
        await c.saveMetadata();

        return { ok: true };
    }

    globalThis.FGR_ACTIONS = globalThis.FGR_ACTIONS || {};
    globalThis.FGR_ACTIONS.rollFlightByClick = rollFlightByClick;
    globalThis.FGR_ACTIONS.undoRound = undoRound;
    globalThis.FGR_ACTIONS.redoRound = redoRound;
    globalThis.FGR_ACTIONS.setRoundNumber = setRoundNumber;
    globalThis.FGR_ACTIONS.setPlayerPositions = setPlayerPositions;
    globalThis.FGR_ACTIONS.applyDirectorEdits = applyDirectorEdits;
    globalThis.FGR_ACTIONS.getResolvedPlayersForUI = getResolvedPlayersForUI;
    globalThis.FGR_ACTIONS.setKingPresetUserCard = setKingPresetUserCard;
    globalThis.FGR_ACTIONS.applyKingDirectorEdits = applyKingDirectorEdits;
    globalThis.FGR_ACTIONS.rollKingByClick = rollKingByClick;
    globalThis.FGR_ACTIONS.resetKingProgress = resetKingProgress;

const c = ctx();
const eventTypes = c.eventTypes || c.event_types || {};

const onEvent = (name, handler) => {
    const ev = eventTypes?.[name];
    if (!ev) return;
    if (!c.eventSource || typeof c.eventSource.on !== 'function') return;
    c.eventSource.on(ev, handler);
};

const syncRoundPromptFromState = () => {
    const st = getChatState();
    if (st?.pendingPacket) {
        const text = st.pendingPacket.overrideText || buildInjectionText(st.pendingPacket);
        setRoundExtensionPrompt(text);
    } else {
        clearRoundExtensionPrompt();
    }
};

const syncCharacterProfileNow = () => {
    const s = getSettings();
    const ensured = ensureCharacterNamedProfile(s);
    if (ensured.changed) {
        c.saveSettingsDebounced();
    }
    if (globalThis.FGR_UI?.refreshPlayerProfileUI) {
        globalThis.FGR_UI.refreshPlayerProfileUI();
    }
};

let fgrBootPromise = null;

const bootstrap = async () => {
    if (fgrBootPromise) return fgrBootPromise;

    fgrBootPromise = (async () => {
        try {
            getSettings();
            await ensureLudoCore();
            await ensureLudoUI();
            await ensureLudoPrompt();
            await ensureKingCore();
            await ensureKingPrompt();
            await loadUiScript();

            globalThis.FGR_UI?.init({
                getSettings,
                getChatState,
                saveSettings: () => ctx().saveSettingsDebounced(),
                saveMetadata: () => ctx().saveMetadata(),
                validateFlightMapJson,
            });

            syncCharacterProfileNow();
            syncRoundPromptFromState();

            await mountDrawerUI();
            bindLongPressOnExtensionsButton();

            console.log('[fair-game-referee] 初始化完成（外部判定+本地随机版）');
        } catch (e) {
            console.error('[fair-game-referee] 初始化失败', e);
        }
    })();

    return fgrBootPromise;
};

onEvent('APP_READY', bootstrap);
onEvent('EXTENSIONS_FIRST_LOAD', bootstrap);
onEvent('SETTINGS_LOADED_AFTER', bootstrap);

onEvent('CHAT_CHANGED', () => {
    syncCharacterProfileNow();
    syncRoundPromptFromState();
});

bootstrap();

if (QR_BOOTSTRAP_ENABLED) {
    bindQuickReplyBootstrap();
}
bindInlineNextRoundButton();
})();
