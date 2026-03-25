(() => {
    function register(UI) {
        if (!UI || UI._ludoUIRegistered) return;
        UI._ludoUIRegistered = true;

        if (typeof UI.selectedPos === 'undefined') UI.selectedPos = null;
        if (typeof UI.boardCols === 'undefined') UI.boardCols = 10;
        if (typeof UI.cellRects === 'undefined') UI.cellRects = [];
        if (typeof UI.editingPos === 'undefined') UI.editingPos = null;
        if (typeof UI.rollAnimating === 'undefined') UI.rollAnimating = false;
        if (typeof UI.animPositions === 'undefined') UI.animPositions = null;
        if (typeof UI.boardDieValue === 'undefined') UI.boardDieValue = [1];
        if (typeof UI.cupPos === 'undefined') UI.cupPos = null;
        if (typeof UI.rollAudio === 'undefined') UI.rollAudio = null;
        if (typeof UI.rollAudioStopTimer === 'undefined') UI.rollAudioStopTimer = null;

        UI.ensureCellEditorModal = function() {
            if ($('#fgr-cell-editor-modal').length) return;

            $('body').append(`
<div id="fgr-cell-editor-modal" style="display:none;position:fixed;inset:0;z-index:35100;background:rgba(0,0,0,.45);align-items:flex-start;justify-content:center;padding-top:124px;padding-left:12px;padding-right:12px;box-sizing:border-box;">
  <div style="width:min(420px,92vw);max-height:calc(100vh - 148px);overflow:auto;background:var(--SmartThemeBlurTintColor,rgba(30,30,30,.96));border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:10px;padding:12px;backdrop-filter: blur(10px);">
    <div style="font-weight:700;margin-bottom:10px;">编辑格子事件</div>

    <div class="settings_section">
      <label>格子</label>
      <input id="fgr-cell-edit-pos" class="text_pole" type="text" disabled />
    </div>

    <div class="settings_section">
      <label>move（必填，整数）</label>
      <input id="fgr-cell-edit-move" class="text_pole" type="number" step="1" />
    </div>

    <div class="settings_section">
      <label>text（可空，可换行）</label>
      <textarea id="fgr-cell-edit-text" class="text_pole" rows="4" style="width:100%;resize:vertical;line-height:1.45;"></textarea>
    </div>

    <div class="settings_section" style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="fgr-cell-edit-delete" class="menu_button" type="button">删除事件</button>
      <button id="fgr-cell-edit-cancel" class="menu_button" type="button">取消</button>
      <button id="fgr-cell-edit-save" class="menu_button" type="button">保存</button>
    </div>
  </div>
</div>
    `);

            const autoGrow = () => {
                const el = document.getElementById('fgr-cell-edit-text');
                if (!el) return;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 220) + 'px';
            };

            $('#fgr-cell-edit-text').on('input', autoGrow);

            $('#fgr-cell-edit-cancel').on('click', () => this.closeCellEditorModal());
            $('#fgr-cell-edit-save').on('click', () => this.saveCellEditorModal());
            $('#fgr-cell-edit-delete').on('click', () => this.deleteCellEditorModal());

            $('#fgr-cell-editor-modal').on('click', (e) => {
                if (e.target && e.target.id === 'fgr-cell-editor-modal') this.closeCellEditorModal();
            });
        };

        UI.normalizeDiceFaces = function(input) {
            let arr = [];
            if (Array.isArray(input)) arr = input;
            else if (Number.isFinite(Number(input))) arr = [Number(input)];

            arr = arr
                .map(x => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1))))
                .slice(0, 2);

            if (!arr.length) arr = [1];
            return arr;
        };

        UI.setCupDieFace = function($el, n) {
            const v = Math.min(6, Math.max(1, Math.trunc(Number(n) || 1)));
            $el.removeClass('face-1 face-2 face-3 face-4 face-5 face-6').addClass('face-' + v);
        };

        UI.setBoardDiceFaces = function(values) {
            const faces = this.normalizeDiceFaces(values);
            const $d1 = $('#fgr-board-die-1');
            const $d2 = $('#fgr-board-die-2');

            if ($d1.length) this.setCupDieFace($d1, faces[0]);

            if ($d2.length) {
                if (faces.length >= 2) {
                    $d2.show();
                    this.setCupDieFace($d2, faces[1]);
                } else {
                    $d2.hide();
                }
            }

            this.boardDieValue = faces;
        };

        UI.openCellEditorModal = function(pos) {
            const p = Math.trunc(Number(pos));
            if (!Number.isFinite(p) || p <= 0) return;

            this.editingPos = p;
            const row = this.findRowByAt(p);

            const move = row ? String(row.find('.fgr-move').val() || '') : '';
            const text = row ? String(row.find('.fgr-text').val() || '') : '';

            $('#fgr-cell-edit-pos').val(String(p));
            $('#fgr-cell-edit-move').val(move);
            $('#fgr-cell-edit-text').val(text);

            $('#fgr-cell-editor-modal').css('display', 'flex');

            const el = document.getElementById('fgr-cell-edit-text');
            if (el) {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 220) + 'px';
            }
        };

        UI.closeCellEditorModal = function() {
            $('#fgr-cell-editor-modal').hide();
            this.editingPos = null;
        };

        UI.saveCellEditorModal = function() {
            const pos = Math.trunc(Number(this.editingPos));
            if (!Number.isFinite(pos) || pos <= 0) return;

            const moveRaw = String($('#fgr-cell-edit-move').val() || '').trim();
            const text = String($('#fgr-cell-edit-text').val() || '').trim();

            if (!moveRaw) {
                toastr.warning('move 不能为空；若要删除请点“删除事件”');
                return;
            }

            const move = Number(moveRaw);
            if (!Number.isFinite(move)) {
                toastr.error('move 必须是数字');
                return;
            }

            this.upsertRow(pos, Math.trunc(move), text);
            this.closeCellEditorModal();
            this.renderBoardCanvas();
            toastr.success(`第 ${pos} 格事件已保存`);
        };

        UI.deleteCellEditorModal = function() {
            const pos = Math.trunc(Number(this.editingPos));
            if (!Number.isFinite(pos) || pos <= 0) return;

            this.removeRowByAt(pos);
            this.closeCellEditorModal();
            this.renderBoardCanvas();
            toastr.info(`已删除第 ${pos} 格事件`);
        };

        UI.quickSaveAnimSpeed = function() {
            const s = this.getSettings();
            const ms = Math.trunc(Number($('#fgr-map-anim-speed').val()));
            s.clickAnimationMs = Number.isFinite(ms) ? Math.min(6000, Math.max(800, ms)) : 2200;
            this.saveSettings();
        };

        UI.ensureRollAudio = function() {
            if (this.rollAudio) return this.rollAudio;
            try {
                const url = encodeURI('/scripts/extensions/third-party/fair-game-referee/骰子.mp3');
                const a = new Audio(url);
                a.preload = 'auto';
                a.volume = 0.6;
                this.rollAudio = a;
                return a;
            } catch (err) {
                console.warn('[fair-game-referee] 初始化音效失败', err);
                return null;
            }
        };

        UI.playRollSound = function(durationMs) {
            const a = this.ensureRollAudio();
            if (!a) return;

            if (this.rollAudioStopTimer) {
                clearTimeout(this.rollAudioStopTimer);
                this.rollAudioStopTimer = null;
            }

            try {
                a.pause();
                a.currentTime = 0;
                const p = a.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(() => {});
                }

                const stopMs = Math.max(300, Math.trunc(Number(durationMs) || 1200));
                this.rollAudioStopTimer = setTimeout(() => {
                    try {
                        a.pause();
                        a.currentTime = 0;
                    } catch (_e) {}
                    this.rollAudioStopTimer = null;
                }, stopMs);
            } catch (err) {
                console.warn('[fair-game-referee] 播放音效失败', err);
            }
        };

        UI.sleep = function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        };

        UI.setRollBtnLocked = function(locked) {
            const $dice = $('#fgr-board-dice');
            if (!$dice.length) return;
            $dice.toggleClass('locked', !!locked);
            $dice.attr('title', locked ? '摇骰中...' : '点击摇骰');
            $dice.attr('aria-disabled', locked ? 'true' : 'false');
        };

        UI.playDiceAnimation = async function(finalValues, durationMs) {
            const finalFaces = this.normalizeDiceFaces(finalValues);
            const count = finalFaces.length;

            const $cup = $('#fgr-board-dice');
            const $d1 = $('#fgr-board-die-1');
            const $d2 = $('#fgr-board-die-2');
            if (!$cup.length || !$d1.length) {
                this.setBoardDiceFaces(finalFaces);
                return;
            }

            const total = Math.max(1200, Math.trunc(Number(durationMs) || 1400));
            const start = Date.now();
            const endAt = start + total;

            this.playRollSound(total);

            $cup.addClass('cup-rolling');
            $d1.addClass('rolling');
            $d2.addClass('rolling');

            while (Date.now() < endAt) {
                const randFaces = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
                this.setBoardDiceFaces(randFaces);

                const t = (Date.now() - start) / Math.max(1, total);
                const interval = Math.max(55, 120 - Math.floor(t * 55));
                await this.sleep(interval);
            }

            this.setBoardDiceFaces(finalFaces);

            $cup.removeClass('cup-rolling').addClass('cup-settle');
            $d1.removeClass('rolling').addClass('settle');
            $d2.removeClass('rolling').addClass('settle');

            await this.sleep(360);

            $cup.removeClass('cup-settle');
            $d1.removeClass('settle');
            $d2.removeClass('settle');
        };

        UI.playMoveAnimation = async function(anim, durationMs) {
            const before = Object.assign({}, anim?.beforePositions || {});
            const after = Object.assign({}, anim?.afterPositions || {});
            const turns = Array.isArray(anim?.turns) ? anim.turns : [];
            const marks = Array.isArray(anim?.collisionMarks) ? anim.collisionMarks : [];

            const order = Array.isArray(anim?.turnOrder) ? anim.turnOrder : Object.keys(after);

            const names = Array.from(new Set([
                ...order,
                ...Object.keys(before),
                ...Object.keys(after),
                ...turns.map(t => String(t?.player || ''))
            ])).filter(Boolean);

            this.animPositions = {};
            for (const name of names) {
                const b = Math.trunc(Number(before[name]));
                const a = Math.trunc(Number(after[name]));
                if (Number.isFinite(b)) this.animPositions[name] = b;
                else if (Number.isFinite(a)) this.animPositions[name] = a;
            }
            this.renderBoardCanvas();

            const stepMove = async (name, from, to, stepMs) => {
                let cur = Math.trunc(Number(from));
                const target = Math.trunc(Number(to));
                if (!Number.isFinite(cur) || !Number.isFinite(target)) return;
                if (cur === target) return;
                while (cur !== target) {
                    cur += (cur < target ? 1 : -1);
                    this.animPositions[name] = cur;
                    this.renderBoardCanvas();
                    await this.sleep(stepMs);
                }
            };

            const jumpTo = async (name, pos) => {
                const p = Math.trunc(Number(pos));
                if (!name || !Number.isFinite(p)) return;
                this.animPositions[name] = p;
                this.renderBoardCanvas();
                await this.sleep(90);
            };

            if (!turns.length) {
                const collisionVictims = new Set(
                    Array.isArray(anim?.collisionVictims)
                        ? anim.collisionVictims.map(x => String(x || '').trim()).filter(Boolean)
                        : []
                );

                let totalSteps = 0;
                for (const name of names) {
                    if (collisionVictims.has(name)) continue;
                    const b = Math.trunc(Number(this.animPositions[name]));
                    const a = Math.trunc(Number(after[name]));
                    if (!Number.isFinite(b) || !Number.isFinite(a)) continue;
                    totalSteps += Math.abs(a - b);
                }
                if (totalSteps <= 0) totalSteps = 1;

                const stepMs = Math.max(240, Math.floor(Math.max(2800, Number(durationMs) || 3600) / totalSteps));

                for (const name of names) {
                    let cur = Math.trunc(Number(this.animPositions[name]));
                    const target = Math.trunc(Number(after[name]));
                    if (!Number.isFinite(cur) || !Number.isFinite(target)) continue;

                    if (collisionVictims.has(name)) {
                        this.animPositions[name] = target;
                        this.renderBoardCanvas();
                        await this.sleep(90);
                        continue;
                    }

                    while (cur !== target) {
                        cur += (cur < target ? 1 : -1);
                        this.animPositions[name] = cur;
                        this.renderBoardCanvas();
                        await this.sleep(stepMs);
                    }

                    await this.sleep(120);
                }

                this.animPositions = null;
                this.renderBoardCanvas();
                return;
            }

            let totalSteps = 0;
            for (const t of turns) {
                const s = Math.trunc(Number(t?.startPos));
                const l = Math.trunc(Number(t?.landedByDice));
                const f = Math.trunc(Number(t?.finalPos));
                if (Number.isFinite(s) && Number.isFinite(l)) totalSteps += Math.abs(l - s);
                if (Number.isFinite(l) && Number.isFinite(f)) totalSteps += Math.abs(f - l);
            }
            if (totalSteps <= 0) totalSteps = 1;

            const totalMs = Math.max(2200, Math.trunc(Number(durationMs) || 3600));
            const stepMs = Math.max(80, Math.floor(totalMs / totalSteps));

            for (const t of turns) {
                const actor = String(t?.player || '');
                if (!actor) continue;

                const startPos = Math.trunc(Number(t?.startPos));
                const landed = Math.trunc(Number(t?.landedByDice));
                const finalPos = Math.trunc(Number(t?.finalPos));

                if (Number.isFinite(startPos)) {
                    if (!Number.isFinite(this.animPositions[actor]) || this.animPositions[actor] !== startPos) {
                        this.animPositions[actor] = startPos;
                        this.renderBoardCanvas();
                        await this.sleep(60);
                    }
                }

                if (Number.isFinite(startPos) && Number.isFinite(landed)) {
                    await stepMove(actor, startPos, landed, stepMs);
                }

                const preMarks = marks.filter(m => String(m?.actor || '') === actor && String(m?.phase || '') === 'pre');
                for (const m of preMarks) {
                    await jumpTo(String(m?.victim || ''), m?.victimAfterPos);
                }

                if (Number.isFinite(landed) && Number.isFinite(finalPos) && finalPos !== landed) {
                    await stepMove(actor, landed, finalPos, stepMs);
                }

                const postMarks = marks.filter(m => String(m?.actor || '') === actor && String(m?.phase || '') === 'post');
                for (const m of postMarks) {
                    await jumpTo(String(m?.victim || ''), m?.victimAfterPos);
                }

                await this.sleep(120);
            }

            this.animPositions = null;
            this.renderBoardCanvas();
        };

        UI.handleRollClick = async function() {
            if (this.rollAnimating) return;

            const s = this.getSettings();
            const state = this.getChatState ? this.getChatState() : null;
            if (!state) return toastr.error('无法读取聊天状态');

            let resetMap = false;
            const winners = state?.lastResult?.result?.winners;
            if (Array.isArray(winners) && winners.length > 0) {
                const ans = window.prompt('上一回合已有人到终点：输入 1=下一回合，2=重开', '1');
                if (ans === null) return;
                resetMap = String(ans).trim() === '2';
            }

            const api = globalThis.FGR_ACTIONS?.rollFlightByClick;
            if (typeof api !== 'function') {
                return toastr.error('摇骰子接口未就绪，请刷新页面后重试');
            }

            const totalMs = Math.min(6000, Math.max(800, Number(s.clickAnimationMs) || 2200));

            try {
                this.rollAnimating = true;
                this.setRollBtnLocked(true);

                const ret = await api({ resetMap });
                if (!ret?.ok) {
                    throw new Error(ret?.error || '裁定失败');
                }

                const diceMs = Math.floor(totalMs * 0.42);
                const moveMs = Math.floor(totalMs * 0.58);

                await this.playDiceAnimation(ret?.animation?.userDice, diceMs);
                await this.playMoveAnimation(ret?.animation, moveMs);

                toastr.success(`飞行棋第${ret.packet.round}回合已裁定`);
            } catch (err) {
                console.error('[fair-game-referee] 点击摇骰子失败', err);
                toastr.error('摇骰子失败：' + (err?.message || err));
            } finally {
                this.rollAnimating = false;
                this.setRollBtnLocked(false);
            }
        };

        UI.getCurrentMapData = function() {
            const parsed = this.getVisualMapData();
            if (parsed && parsed.ok) return parsed.map;
            try {
                const raw = JSON.parse(String(this.getSettings().flightMapJson || ''));
                if (raw && typeof raw === 'object') return raw;
            } catch (_e) {}
            return { winPosition: 20, events: [] };
        };

        UI.getEventTextAt = function(map, pos) {
            const p = Math.trunc(Number(pos));
            const events = Array.isArray(map?.events) ? map.events : [];
            const hit = events.find(e => Math.trunc(Number(e?.at)) === p);
            return String(hit?.text || '').trim();
        };

        UI.renderDirectorEditor = function(targetRowsSelector) {
            const state = this.getChatState ? this.getChatState() : null;
            if (!state) return;

            const selector = targetRowsSelector || '#fgr-director-rows';
            const $rows = $(selector);
            if (!$rows.length) return;

            const map = this.getCurrentMapData();
            const players = Array.isArray(state.pendingPacket?.players)
                ? state.pendingPacket.players
                : (Array.isArray(state.players) ? state.players : []);

            const order = Array.isArray(state.pendingPacket?.turnOrder) && state.pendingPacket.turnOrder.length
                ? state.pendingPacket.turnOrder
                : players;

            const posObj = state.flight && state.flight.positions ? state.flight.positions : {};

            $rows.empty();
            order.forEach(name => {
                const v = posObj && posObj[name] != null ? Math.trunc(Number(posObj[name])) : '';
                const eventText = this.getEventTextAt(map, v);

                const row = $(`
<tr>
  <td>${name}</td>
  <td><input class="text_pole fgr-director-pos" type="number" step="1" data-name="${name}" /></td>
  <td><span class="fgr-director-event">—</span></td>
</tr>`);

                row.find('.fgr-director-pos').val(Number.isFinite(v) ? v : '');
                row.find('.fgr-director-event').text(eventText || '—');
                $rows.append(row);
            });
        };

        UI.updateDirectorRowEvent = function(e) {
            const map = this.getCurrentMapData();
            const $row = $(e.currentTarget).closest('tr');
            const v = Math.trunc(Number($(e.currentTarget).val()));
            const text = this.getEventTextAt(map, v);
            $row.find('.fgr-director-event').text(text || '—');
        };

        UI.applyDirectorEdits = async function() {
            const api = globalThis.FGR_ACTIONS?.applyDirectorEdits;
            if (typeof api !== 'function') {
                return toastr.error('导演编辑接口未就绪，请刷新页面后重试');
            }

            const posMap = {};
            $('#fgr-director-rows .fgr-director-pos').each((_, el) => {
                const name = String($(el).data('name') || '').trim();
                if (!name) return;
                const v = Math.trunc(Number($(el).val()));
                if (!Number.isFinite(v)) return;
                posMap[name] = v;
            });

            try {
                const ret = await api(posMap);
                if (!ret?.ok) return toastr.error(ret?.error || '修改失败');
                this.renderBoardCanvas();
                this.renderDirectorEditor();
                toastr.success('已应用到回合包并更新提示词');
            } catch (err) {
                toastr.error('修改失败：' + (err?.message || err));
            }
        };

        UI.handleUndoRound = async function() {
            if (this.rollAnimating) return;

            const api = globalThis.FGR_ACTIONS?.undoRound;
            if (typeof api !== 'function') {
                return toastr.error('回退接口未就绪，请刷新页面后重试');
            }

            try {
                const ret = await api();
                if (!ret?.ok) {
                    return toastr.info(ret?.error || '没有可回退内容');
                }

                this.renderBoardCanvas();
                toastr.success(`已回退到第${ret.round}回合`);
            } catch (err) {
                console.error('[fair-game-referee] 回退失败', err);
                toastr.error('回退失败：' + (err?.message || err));
            }
        };

        UI.handleRedoRound = async function() {
            if (this.rollAnimating) return;

            const api = globalThis.FGR_ACTIONS?.redoRound;
            if (typeof api !== 'function') {
                return toastr.error('前进接口未就绪，请刷新页面后重试');
            }

            try {
                const ret = await api();
                if (!ret?.ok) {
                    return toastr.info(ret?.error || '没有可前进内容');
                }

                this.renderBoardCanvas();
                toastr.success(`已前进到第${ret.round}回合`);
            } catch (err) {
                console.error('[fair-game-referee] 前进失败', err);
                toastr.error('前进失败：' + (err?.message || err));
            }
        };

        UI.dedupeName = function(name, usedSet) {
            const base = String(name || '未命名地图').trim() || '未命名地图';
            let n = base;
            let i = 2;
            while (usedSet.has(n)) {
                n = base + '(' + i + ')';
                i++;
            }
            return n;
        };

        UI.getSafeMapFromRaw = function(raw) {
            try {
                const checked = this.validateFlightMapJson(JSON.stringify(raw));
                if (!checked.ok) return null;
                const map = checked.map;
                const events = Array.isArray(map.events) ? map.events : [];
                return {
                    winPosition: Math.trunc(Number(map.winPosition) || 20),
                    events: events.map(e => ({
                        at: Math.trunc(Number(e.at)),
                        move: Math.trunc(Number(e.move || 0)),
                        text: String(e.text || '')
                    })).filter(e => Number.isFinite(e.at))
                };
            } catch (_e) {
                return null;
            }
        };

        UI.getMapLibrary = function(settings) {
            let lib = null;
            try { lib = JSON.parse(String(settings.mapLibraryJson || '')); } catch (_e) {}

            if (!lib || typeof lib !== 'object') lib = { active: '默认地图', items: [] };
            if (!Array.isArray(lib.items)) lib.items = [];
            if (typeof lib.active !== 'string') lib.active = '';

            if (!lib.items.length) {
                const fallbackChecked = this.validateFlightMapJson(settings.flightMapJson || '{"winPosition":20,"events":[]}');
                const fallbackMap = fallbackChecked.ok ? fallbackChecked.map : { winPosition: 20, events: [] };
                lib.items.push({ name: '默认地图', map: fallbackMap });
                lib.active = '默认地图';
            }

            const used = new Set();
            const cleaned = [];
            for (const item of lib.items) {
                if (!item || typeof item !== 'object') continue;
                const safe = this.getSafeMapFromRaw(item.map || {});
                if (!safe) continue;
                const fixedName = this.dedupeName(String(item.name || '未命名地图').trim(), used);
                used.add(fixedName);
                cleaned.push({ name: fixedName, map: safe });
            }

            if (!cleaned.length) cleaned.push({ name: '默认地图', map: { winPosition: 20, events: [] } });
            lib.items = cleaned;
            if (!lib.items.some(i => i.name === lib.active)) lib.active = lib.items[0].name;
            return lib;
        };

        UI.setMapLibrary = function(settings, lib) {
            settings.mapLibraryJson = JSON.stringify(lib, null, 2);
        };

        UI.findMapByName = function(lib, name) {
            return lib.items.find(i => i.name === name) || null;
        };

        UI.renderMapSelector = function(settings, lib) {
            const $sel = $('#fgr-map-select');
            $sel.empty();
            for (const item of lib.items) {
                const $opt = $('<option></option>');
                $opt.val(item.name);
                $opt.text(item.name);
                $sel.append($opt);
            }
            $sel.val(lib.active);
        };

        UI.switchActiveMap = function(name, silent) {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);
            const item = this.findMapByName(lib, String(name || '').trim());
            if (!item) return;

            lib.active = item.name;
            this.setMapLibrary(s, lib);

            s.flightMapJson = JSON.stringify(item.map, null, 2);
            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(item.map);
            this.saveSettings();

            if (!silent) toastr.success('已载入地图：' + item.name);
        };

        UI.addMapRow = function(data, silent) {
            const d = data || { at: '', move: 0, text: '' };
            const row = $(`
<tr class="fgr-map-row">
  <td><input class="text_pole fgr-at" type="number" step="1" /></td>
  <td><input class="text_pole fgr-move" type="number" step="1" /></td>
  <td><input class="text_pole fgr-text" type="text" /></td>
  <td>
    <button class="menu_button fgr-del-row fgr-icon-btn" type="button" title="删除事件" aria-label="删除事件">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8ZM7 5V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V5H22V7H2V5H7ZM9 4V5H15V4H9ZM9 12V18H11V12H9ZM13 12V18H15V12H13Z"></path></svg>
    </button>
  </td>
</tr>`);
            row.find('.fgr-at').val(d.at);
            row.find('.fgr-move').val(d.move);
            row.find('.fgr-text').val(d.text);
            row.find('.fgr-del-row').on('click', () => {
                row.remove();
                this.renderBoardCanvas();
            });

            $('#fgr-map-rows').append(row);
            if (!silent) this.renderBoardCanvas();
        };

        UI.loadMapToEditor = function(map) {
            $('#fgr-map-win-position').val(Number(map.winPosition) || 20);
            $('#fgr-map-rows').empty();
            const events = Array.isArray(map.events) ? map.events : [];
            for (const e of events) {
                this.addMapRow({
                    at: Number(e.at),
                    move: Number(e.move || 0),
                    text: String(e.text || '')
                }, true);
            }
            this.renderBoardCanvas();
        };

        UI.getVisualMapData = function() {
            const winPosition = Number($('#fgr-map-win-position').val());
            if (!Number.isFinite(winPosition) || winPosition <= 0) return { ok: false, error: '终点格必须>0' };

            const events = [];
            let bad = false;
            $('#fgr-map-rows .fgr-map-row').each((_, el) => {
                const at = Number($(el).find('.fgr-at').val());
                const move = Number($(el).find('.fgr-move').val());
                const text = String($(el).find('.fgr-text').val() || '').trim();

                if (!Number.isFinite(at)) { bad = true; return false; }

                events.push({
                    at: Math.trunc(at),
                    move: Number.isFinite(move) ? Math.trunc(move) : 0,
                    text: text
                });
            });

            if (bad) return { ok: false, error: 'at 不是数字' };
            events.sort((a, b) => a.at - b.at);
            return { ok: true, map: { winPosition: Math.trunc(winPosition), events: events } };
        };

        UI.safeFilename = function(str) {
            return String(str || 'map').replace(/[\\/:*?"<>|]/g, '_').trim() || 'map';
        };

        UI.downloadJson = function(filename, obj) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        };

        UI.exportSelectedMap = function() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);
            const name = String($('#fgr-map-select').val() || '').trim();
            const item = this.findMapByName(lib, name);
            if (!item) return toastr.error('未找到选中地图');

            this.downloadJson('fgr-map-' + this.safeFilename(item.name) + '.json', {
                fgrMap: true,
                name: item.name,
                map: item.map
            });
            toastr.success('已导出地图：' + item.name);
        };

        UI.exportAllMapsPack = function() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);
            this.downloadJson('fgr-map-pack.json', {
                fgrMapPack: true,
                version: 1,
                active: lib.active,
                maps: lib.items
            });
            toastr.success('已导出全部地图包');
        };

        UI.exportByChoice = function() {
            const ans = window.prompt('导出类型：输入 1=选中地图，2=全部地图包', '1');
            if (ans === null) return;
            const x = String(ans).trim();
            if (x === '2') this.exportAllMapsPack();
            else this.exportSelectedMap();
        };

        UI.importMapFile = async function(e) {
            const file = e && e.target && e.target.files ? e.target.files[0] : null;
            $('#fgr-map-import-file').val('');
            if (!file) return;

            try {
                const text = await file.text();
                const obj = JSON.parse(text);

                const s = this.getSettings();
                const lib = this.getMapLibrary(s);
                const used = new Set(lib.items.map(i => i.name));
                const imported = [];

                const pushOne = (name, mapRaw) => {
                    const safe = this.getSafeMapFromRaw(mapRaw);
                    if (!safe) return false;
                    const finalName = this.dedupeName(String(name || '导入地图'), used);
                    used.add(finalName);
                    lib.items.push({ name: finalName, map: safe });
                    imported.push(finalName);
                    return true;
                };

                if (obj && obj.fgrMapPack === true && Array.isArray(obj.maps)) {
                    for (const m of obj.maps) pushOne(m && m.name ? m.name : '导入地图', m && m.map ? m.map : {});
                } else if (obj && obj.fgrMap === true && obj.map) {
                    pushOne(obj.name || file.name.replace(/\.json$/i, ''), obj.map);
                } else if (obj && Number.isFinite(Number(obj.winPosition)) && Array.isArray(obj.events)) {
                    pushOne(file.name.replace(/\.json$/i, ''), obj);
                } else {
                    return toastr.error('导入失败：不是有效地图JSON或地图包JSON');
                }

                if (!imported.length) return toastr.error('导入失败：没有有效地图');

                lib.active = imported[0];
                this.setMapLibrary(s, lib);

                const activeItem = this.findMapByName(lib, lib.active);
                s.flightMapJson = JSON.stringify(activeItem.map, null, 2);
                $('#fgr-set-flight-map-json').val(s.flightMapJson);

                this.renderMapSelector(s, lib);
                this.loadMapToEditor(activeItem.map);
                this.saveSettings();

                toastr.success('导入成功：' + imported.join('、'));
            } catch (err) {
                toastr.error('导入失败：' + (err && err.message ? err.message : err));
            }
        };

        UI.getPosCellInfo = function(pos, cols, rowsTotal) {
            const idx = pos - 1;
            const rowFromBottom = Math.floor(idx / cols);
            const offset = idx % cols;
            const col = (rowFromBottom % 2 === 0) ? offset : (cols - 1 - offset);
            const rowTop = rowsTotal - 1 - rowFromBottom;
            return { col, rowTop };
        };

        UI.getEventsMap = function(events) {
            const map = new Map();
            for (const e of (events || [])) {
                const at = Number(e.at);
                if (Number.isFinite(at)) map.set(at, e);
            }
            return map;
        };

        UI.getPiecesByPos = function(win) {
            const state = this.getChatState ? this.getChatState() : null;
            const positions = this.animPositions || (state && state.flight && state.flight.positions ? state.flight.positions : {});
            const buckets = new Map();

            for (const name in positions) {
                if (!Object.prototype.hasOwnProperty.call(positions, name)) continue;
                let p = Number(positions[name]);
                if (!Number.isFinite(p)) continue;

                if (p <= 0) continue;
                if (p > win) p = win;
                p = Math.trunc(p);

                if (!buckets.has(p)) buckets.set(p, []);
                buckets.get(p).push(name);
            }

            return { buckets, positions };
        };

        UI.colorByName = function(name) {
            const palette = ['#ff6fa8', '#6fc2ff', '#ffd36f', '#8affb2', '#c59bff', '#ff9f6f'];
            let h = 0;
            const s = String(name || '');
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return palette[h % palette.length];
        };

        UI.renderPieceList = function(positionsObj) {
            const entries = Object.entries(positionsObj || {})
                .map(([name, p]) => [name, Number(p)])
                .filter(([, p]) => Number.isFinite(p))
                .sort((a, b) => b[1] - a[1]);

            const $list = $('#fgr-piece-list');
            if (!$list.length) return;
            if (!entries.length) {
                $list.text('当前聊天暂无棋子位置数据（先跑一回合飞行棋即可显示）');
                return;
            }

            $list.html(entries.map(([name, p]) => `<span>${name}: <b>${Math.trunc(p)}</b>格</span>`).join(' ｜ '));
        };

        UI.roundRect = function(ctx, x, y, w, h, r, fill, stroke) {
            const rr = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + w, y, x + w, y + h, rr);
            ctx.arcTo(x + w, y + h, x, y + h, rr);
            ctx.arcTo(x, y + h, x, y, rr);
            ctx.arcTo(x, y, x + w, y, rr);
            ctx.closePath();
            if (fill) ctx.fill();
            if (stroke) ctx.stroke();
        };

        UI.clipText = function(t, n) {
            const s = String(t || '');
            return s.length <= n ? s : (s.slice(0, n) + '…');
        };

        UI.renderBoardCanvas = function() {
            const parsed = this.getVisualMapData();
            const canvas = document.getElementById('fgr-board-canvas');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (!parsed.ok) {
                canvas.width = 800;
                canvas.height = 120;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ff8b8b';
                ctx.font = '14px sans-serif';
                ctx.fillText('地图数据错误：' + parsed.error, 16, 40);
                return;
            }

            const map = parsed.map;
            const win = Number(map.winPosition) || 20;

            const wrap = document.getElementById('fgr-board-wrap');
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const cssWidth = Math.max(320, ((wrap ? wrap.clientWidth : 900) - 20));

            const cols = 5;
            this.boardCols = cols;

            const rowsTotal = Math.max(1, Math.ceil((win + 1) / cols));
            const cellW = Math.floor(cssWidth / cols);
            const cellH = cellW < 58 ? 62 : 52;
            const cssHeight = rowsTotal * cellH;

            canvas.style.height = cssHeight + 'px';
            canvas.width = Math.floor(cssWidth * dpr);
            canvas.height = Math.floor(cssHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssWidth, cssHeight);

            const eventsMap = this.getEventsMap(map.events);

            const cupRowTop = Math.floor((rowsTotal - 1) / 2);
            const cupCol = Math.floor(cols / 2);
            const cupCenter = {
                x: cupCol * cellW + cellW / 2,
                y: cupRowTop * cellH + cellH / 2,
            };

            const slots = [];
            for (let rowFromBottom = 0; rowFromBottom < rowsTotal; rowFromBottom++) {
                const rowTop = rowsTotal - 1 - rowFromBottom;
                const leftToRight = rowFromBottom % 2 === 0;

                if (leftToRight) {
                    for (let col = 0; col < cols; col++) {
                        if (rowTop === cupRowTop && col === cupCol) continue;
                        slots.push({ rowTop, col });
                    }
                } else {
                    for (let col = cols - 1; col >= 0; col--) {
                        if (rowTop === cupRowTop && col === cupCol) continue;
                        slots.push({ rowTop, col });
                    }
                }
            }

            const posToSlot = new Map();
            const keyToPos = new Map();
            for (let p = 1; p <= win; p++) {
                const slot = slots[p - 1];
                if (!slot) break;
                posToSlot.set(p, slot);
                keyToPos.set(`${slot.rowTop}_${slot.col}`, p);
            }

            const state = this.getChatState ? this.getChatState() : null;
            const marks = Array.isArray(state?.lastResult?.result?.collisionMarks)
                ? state.lastResult.result.collisionMarks
                : [];

            const collisionVictimsByPos = new Map();
            for (const m of marks) {
                const p = Math.trunc(Number(m?.pos));
                if (!Number.isFinite(p)) continue;
                const victim = String(m?.victim || '').trim();
                if (!collisionVictimsByPos.has(p)) collisionVictimsByPos.set(p, []);
                if (victim) {
                    const arr = collisionVictimsByPos.get(p);
                    if (!arr.includes(victim)) arr.push(victim);
                }
            }

            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let p = 1; p <= win; p++) {
                const slot = posToSlot.get(p);
                if (!slot) continue;
                const x = slot.col * cellW + cellW / 2;
                const y = slot.rowTop * cellH + cellH / 2;
                if (p === 1) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            this.cellRects = [];

            for (let rowTop = 0; rowTop < rowsTotal; rowTop++) {
                for (let col = 0; col < cols; col++) {
                    const isCupCell = rowTop === cupRowTop && col === cupCol;
                    const pos = keyToPos.get(`${rowTop}_${col}`) || null;

                    const x = col * cellW + 4;
                    const y = rowTop * cellH + 4;
                    const w = cellW - 8;
                    const h = cellH - 8;

                    const hasEvent = !!(pos && eventsMap.has(pos));

                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.35)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 2;

                    const grad = ctx.createLinearGradient(x, y, x, y + h);
                    if (isCupCell) {
                        grad.addColorStop(0, 'rgba(255,255,255,0.02)');
                        grad.addColorStop(1, 'rgba(255,255,255,0.01)');
                    } else if (hasEvent) {
                        grad.addColorStop(0, 'rgba(240,184,75,0.25)');
                        grad.addColorStop(1, 'rgba(240,184,75,0.1)');
                    } else {
                        grad.addColorStop(0, 'rgba(255,255,255,0.07)');
                        grad.addColorStop(1, 'rgba(255,255,255,0.02)');
                    }

                    ctx.fillStyle = grad;
                    ctx.strokeStyle = isCupCell ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.20)';
                    ctx.lineWidth = 1;
                    this.roundRect(ctx, x, y, w, h, 8, true, true);
                    ctx.restore();

                    if (!isCupCell && pos) {
                        const isStart = pos === 1;
                        const isEnd = pos === win;
                        const isSelected = this.selectedPos === pos;

                        if (isStart) {
                            ctx.strokeStyle = '#4ea1ff';
                            ctx.lineWidth = 2;
                            this.roundRect(ctx, x, y, w, h, 8, false, true);
                        }
                        if (isEnd) {
                            ctx.strokeStyle = '#41d67a';
                            ctx.lineWidth = 2;
                            this.roundRect(ctx, x, y, w, h, 8, false, true);
                        }
                        if (isSelected) {
                            ctx.strokeStyle = '#ff6fa8';
                            ctx.lineWidth = 2.5;
                            this.roundRect(ctx, x, y, w, h, 8, false, true);
                        }

                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 12px sans-serif';
                        ctx.fillText('#' + pos, x + 8, y + 18);

                        if (hasEvent) {
                            const ev = eventsMap.get(pos);
                            const move = Number(ev.move || 0);
                            const moveText = (move >= 0 ? '+' : '') + move;

                            ctx.fillStyle = '#ffd37e';
                            ctx.font = '12px sans-serif';
                            ctx.fillText(moveText, x + 8, y + 36);
                        }

                        const victims = collisionVictimsByPos.get(pos) || [];
                        if (victims.length > 0) {
                            const show = victims.slice(0, 2);
                            show.forEach((name, i) => {
                                const cx = x + w - 12 - i * 18;
                                const cy = y + 12;
                                const first = String(name || '?').trim().charAt(0) || '?';

                                ctx.save();
                                ctx.setLineDash([3, 2]);
                                ctx.lineWidth = 1.5;
                                ctx.strokeStyle = 'rgba(255,120,120,0.95)';
                                ctx.beginPath();
                                ctx.arc(cx, cy, 8, 0, Math.PI * 2);
                                ctx.stroke();
                                ctx.restore();

                                ctx.fillStyle = '#fff';
                                ctx.font = 'bold 10px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(first, cx, cy);
                            });

                            if (victims.length > 2) {
                                ctx.fillStyle = 'rgba(255,180,180,0.95)';
                                ctx.font = '10px sans-serif';
                                ctx.textAlign = 'right';
                                ctx.textBaseline = 'alphabetic';
                                ctx.fillText('+' + (victims.length - 2), x + w - 6, y + 16);
                            }

                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';
                        }

                        this.cellRects.push({ pos, x, y, w, h, col, rowTop });
                    }
                }
            }

            this.cupPos = null;
            this.placeBoardDice(rowsTotal, cupCenter);

            const pieceData = this.getPiecesByPos(win);
            this.renderPieceList(pieceData.positions);

            for (const [pos, names] of pieceData.buckets.entries()) {
                const cell = this.cellRects.find(c => c.pos === pos);
                if (!cell) continue;

                const r = 8;
                const baseX = cell.x + cell.w - 14;
                const baseY = cell.y + cell.h - 14;

                names.slice(0, 4).forEach((name, i) => {
                    const ox = (i % 2) * 18;
                    const oy = Math.floor(i / 2) * 18;
                    const cx = baseX - ox;
                    const cy = baseY - oy;

                    ctx.beginPath();
                    ctx.fillStyle = this.colorByName(name);
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#111';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(name || '?').slice(0, 1), cx, cy);
                });

                if (names.length > 4) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'end';
                    ctx.fillText('+' + (names.length - 4), cell.x + cell.w - 38, cell.y + cell.h - 6);
                }
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
        };

        UI.placeBoardDice = function(rowsTotal, fixedCenter) {
            const $dice = $('#fgr-board-dice');
            if (!$dice.length) return;

            if (fixedCenter && Number.isFinite(fixedCenter.x) && Number.isFinite(fixedCenter.y)) {
                $dice.css({
                    left: `${fixedCenter.x}px`,
                    top: `${fixedCenter.y}px`,
                });
                this.setBoardDiceFaces(this.boardDieValue);
                return;
            }

            if (!Array.isArray(this.cellRects) || !this.cellRects.length) {
                $dice.css({ left: '50%', top: '50%' });
                this.setBoardDiceFaces(this.boardDieValue);
                return;
            }

            const rowCount = Math.max(1, Math.trunc(Number(rowsTotal) || 1));
            const midRowTop = Math.floor((rowCount - 1) / 2);
            const centerCol = 2;

            let target = this.cellRects.find(c => c.rowTop === midRowTop && c.col === centerCol);
            if (!target) target = this.cellRects[Math.floor(this.cellRects.length / 2)];
            if (!target) return;

            const cx = target.x + target.w / 2;
            const cy = target.y + target.h / 2;

            $dice.css({
                left: `${cx}px`,
                top: `${cy}px`,
            });

            this.setBoardDiceFaces(this.boardDieValue);
        };

        UI.onCanvasClick = function(evt) {
            const canvas = document.getElementById('fgr-board-canvas');
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const x = evt.clientX - rect.left;
            const y = evt.clientY - rect.top;

            const hit = this.cellRects.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
            if (!hit) return;
            if (Number(hit.pos) === Number(this.cupPos)) return;

            this.selectedPos = Number(hit.pos);
            this.renderBoardCanvas();
            this.openCellEditorModal(this.selectedPos);
        };

        UI.findRowByAt = function(pos) {
            let found = null;
            $('#fgr-map-rows .fgr-map-row').each((_, el) => {
                const at = Number($(el).find('.fgr-at').val());
                if (Number.isFinite(at) && at === pos) {
                    found = $(el);
                    return false;
                }
            });
            return found;
        };

        UI.upsertRow = function(at, move, text) {
            const row = this.findRowByAt(at);
            if (row) {
                row.find('.fgr-move').val(move);
                row.find('.fgr-text').val(text);
                return;
            }
            this.addMapRow({ at, move, text }, true);
        };

        UI.removeRowByAt = function(at) {
            const row = this.findRowByAt(at);
            if (row) row.remove();
        };

        UI.editEventByPos = function(pos) {
            const row = this.findRowByAt(pos);
            const oldMove = row ? Number(row.find('.fgr-move').val() || 0) : 0;
            const oldText = row ? String(row.find('.fgr-text').val() || '') : '';

            const moveInput = window.prompt('第 ' + pos + ' 格：输入 move（留空=删除该格事件）', String(oldMove));
            if (moveInput === null) return;

            if (String(moveInput).trim() === '') {
                this.removeRowByAt(pos);
                toastr.info('已删除第 ' + pos + ' 格事件');
                this.renderBoardCanvas();
                return;
            }

            const move = Number(moveInput);
            if (!Number.isFinite(move)) {
                toastr.error('move 必须是数字');
                return;
            }

            const textInput = window.prompt('第 ' + pos + ' 格：输入 text 描述', oldText);
            if (textInput === null) return;

            this.upsertRow(pos, Math.trunc(move), String(textInput).trim());
            toastr.success('第 ' + pos + ' 格事件已更新');
            this.renderBoardCanvas();
        };

        UI.resetFlightProgress = async function() {
            const state = this.getChatState ? this.getChatState() : null;
            if (!state) return toastr.error('无法读取当前聊天状态');

            const ok = window.confirm('确定重置本聊天的飞行棋棋子进度吗？');
            if (!ok) return;

            state.currentGame = 'flight';
            state.round = 0;
            state.flight = { positions: {} };
            state.lastResult = null;
            state.pendingPacket = null;
            state.players = [];
            state.lastHandledUserFingerprint = '';
            state.historyStack = [];
            state.futureStack = [];

            const c = SillyTavern.getContext();

            if (typeof c.setExtensionPrompt === 'function') {
                c.setExtensionPrompt('fair-game-referee', '', 1, 0, false, 0);
            }

            if (Array.isArray(c.chat)) {
                for (let i = c.chat.length - 1; i >= 0; i--) {
                    const m = c.chat[i];
                    if (
                        m &&
                        !m.is_user &&
                        String(m.name || '') === 'System Note' &&
                        typeof m.mes === 'string' &&
                        m.mes.includes('【公平裁定-回合包】')
                    ) {
                        c.chat.splice(i, 1);
                    }
                }
            }

            if (this.saveMetadata) await this.saveMetadata();
            this.renderBoardCanvas();
            toastr.success('已重置飞行棋进度，可重新开始');
        };

        UI.saveMapFromVisual = function() {
            const s = this.getSettings();
            const parsed = this.getVisualMapData();
            if (!parsed.ok) return toastr.error(parsed.error);

            const lib = this.getMapLibrary(s);
            let targetName = String($('#fgr-map-select').val() || '').trim();
            if (!targetName) targetName = lib.active || (lib.items[0] ? lib.items[0].name : '默认地图');

            const idx = lib.items.findIndex(i => i.name === targetName);
            if (idx >= 0) lib.items[idx] = { name: targetName, map: parsed.map };
            else lib.items.push({ name: targetName, map: parsed.map });
            lib.active = targetName;

            this.setMapLibrary(s, lib);
            s.flightMapJson = JSON.stringify(parsed.map, null, 2);
            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            this.renderMapSelector(s, lib);
            this.saveSettings();
            this.renderBoardCanvas();
            toastr.success('已保存并覆盖地图：' + targetName);
        };

        UI.renameSelectedMap = function() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);

            const oldName = String($('#fgr-map-select').val() || '').trim();
            if (!oldName) return toastr.warning('请先选择要重命名的地图');

            const newNameRaw = window.prompt('请输入新的地图名称：', oldName);
            if (newNameRaw === null) return;
            const newName = String(newNameRaw || '').trim();

            if (!newName) return toastr.warning('新名称不能为空');
            if (oldName === newName) return toastr.info('名称未变化');
            if (lib.items.some(i => i.name === newName)) return toastr.error('已存在同名地图，请换个名字');

            const item = this.findMapByName(lib, oldName);
            if (!item) return toastr.error('未找到选中地图');

            item.name = newName;
            if (lib.active === oldName) lib.active = newName;

            this.setMapLibrary(s, lib);
            this.renderMapSelector(s, lib);
            this.saveSettings();
            toastr.success(`已重命名：${oldName} → ${newName}`);
        };

        UI.deleteSelectedMap = function() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);
            const name = String($('#fgr-map-select').val() || '').trim();

            if (!name) return toastr.warning('请先选择地图');
            if (lib.items.length <= 1) return toastr.warning('至少保留一个地图');

            const ok = window.confirm('确定删除地图 "' + name + '" 吗？');
            if (!ok) return;

            lib.items = lib.items.filter(i => i.name !== name);
            if (!lib.items.length) lib.items = [{ name: '默认地图', map: { winPosition: 20, events: [] } }];
            lib.active = lib.items[0].name;

            this.setMapLibrary(s, lib);
            s.flightMapJson = JSON.stringify(lib.items[0].map, null, 2);
            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(lib.items[0].map);
            this.saveSettings();
            toastr.success('已删除：' + name);
        };
    }

    globalThis.FGR_LUDO_UI = { register };
})();
