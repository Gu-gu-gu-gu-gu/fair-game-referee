(() => {
    const EXT_PATH = '/scripts/extensions/third-party/fair-game-referee';
    const LAST_TAB_STORAGE_KEY = 'fgr_last_tab';
    const UI = {
        inited: false,
        getSettings: null,
        getChatState: null,
        saveSettings: null,
        saveMetadata: null,
        validateFlightMapJson: null,

        characterProfileKey: 'fair-game-referee_character_profile',

        selectedPos: null,
        boardCols: 10,
        cellRects: [],
        editingPos: null,
        rollAnimating: false,
        animPositions: null,
        boardDieValue: [1],
        cupPos: null,
        rollAudio: null,
        rollAudioStopTimer: null,

        cardBusy: false,
        currentCardPool: [],
        currentCardVisuals: [],
        cardLayout: null,
        cardSfx: { shuffle: null, flip: null, deal: null },
        kingDirectorPacket: null,
        lastTab: 'map',

        normalizeDiceMode(raw) {
            const x = String(raw || '')
                .trim()
                .toLowerCase();
            if (['fixed', '固定', '固定模式', 'manual'].includes(x)) return 'fixed';
            return 'auto';
        },

getCurrentCharacterName() {
    const c = SillyTavern.getContext();

    const chid = Number(c.characterId);
    if (Number.isInteger(chid) && chid >= 0) {
        const byCard = String(c.characters?.[chid]?.name || '').trim();
        if (byCard) return byCard;
    }

    const byName2 = String(c.name2 || '').trim();
    if (byName2) return byName2;

    return '';
},

        getPlayerProfileLibrary(settings) {
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
        },

        setPlayerProfileLibrary(settings, lib) {
            settings.playerProfileLibraryJson = JSON.stringify(lib);
        },

getNameArrayMap(raw) {
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
            const key = n.toLowerCase();
            if (!key) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(n);
        }
        obj[k] = out;
    }

    return obj;
},

getPlayerPoolByProfile(settings) {
    return this.getNameArrayMap(settings.playerPoolByProfileJson);
},

setPlayerPoolByProfile(settings, map) {
    settings.playerPoolByProfileJson = JSON.stringify(map);
},

getPlayerSelectedByProfile(settings) {
    return this.getNameArrayMap(settings.playerSelectedByProfileJson);
},

setPlayerSelectedByProfile(settings, map) {
    settings.playerSelectedByProfileJson = JSON.stringify(map);
},

ensureProfilePlayerData(settings, profileName) {
    const name = String(profileName || '').trim();
    if (!name) return { pool: [], selected: [] };

    const poolMap = this.getPlayerPoolByProfile(settings);
    const selectedMap = this.getPlayerSelectedByProfile(settings);

    if (!Array.isArray(poolMap[name])) poolMap[name] = [];
    if (!Array.isArray(selectedMap[name])) selectedMap[name] = [];

    const pool = poolMap[name];
    const poolKeySet = new Set(pool.map((x) => String(x).toLowerCase()));
    const selected = selectedMap[name].filter((x) => poolKeySet.has(String(x).toLowerCase()));

    selectedMap[name] = selected;

    this.setPlayerPoolByProfile(settings, poolMap);
    this.setPlayerSelectedByProfile(settings, selectedMap);

    return { pool, selected };
},

renderPlayerMultiSelect() {
    const s = this.getSettings();
    const active = String(s.activePlayerProfileName || '').trim();
    const ensured = this.ensureProfilePlayerData(s, active);
    const pool = Array.isArray(ensured.pool) ? ensured.pool : [];
    const selectedSet = new Set((ensured.selected || []).map((x) => String(x).toLowerCase()));

    const $sel = $('#fgr-edit-player-select');
    if (!$sel.length) return;

    // 关键：先彻底清空旧状态，避免跨名单残留“已选N项”
    $sel.val([]);
    $sel.empty();

    if (!active) {
        $sel.prop('disabled', true);
        $sel.append(`<option value="" disabled>请先选择名单</option>`);
        return;
    }

    if (!pool.length) {
        $sel.prop('disabled', true);
        $sel.append(`<option value="" disabled>当前名单暂无玩家，请先在上方输入后点 +</option>`);
        return;
    }

    $sel.prop('disabled', false);

    pool.forEach((name) => {
        const key = String(name).toLowerCase();
        const isSel = selectedSet.has(key);

        const $opt = $('<option></option>');
        $opt.val(name);
        $opt.text(name);
        if (isSel) $opt.prop('selected', true);
        $sel.append($opt);
    });
},

onPlayerMultiSelectChange() {
    const s = this.getSettings();
    const active = String(s.activePlayerProfileName || '').trim();
    if (!active) return;

    const selectedValues = $('#fgr-edit-player-select').val();
    const selected = Array.isArray(selectedValues)
        ? selectedValues.map((x) => String(x || '').trim()).filter(Boolean)
        : [];

    const selectedMap = this.getPlayerSelectedByProfile(s);
    selectedMap[active] = selected;
    this.setPlayerSelectedByProfile(s, selectedMap);
    this.saveSettings();
},

addPlayerToPool() {
    const s = this.getSettings();
    const active = String(s.activePlayerProfileName || '').trim();
    if (!active) return toastr.warning('请先选择名单');

    const input = String($('#fgr-edit-player-input').val() || '').trim();
    if (!input) return toastr.warning('请输入玩家名');

    const poolMap = this.getPlayerPoolByProfile(s);
    const selectedMap = this.getPlayerSelectedByProfile(s);

    if (!Array.isArray(poolMap[active])) poolMap[active] = [];
    if (!Array.isArray(selectedMap[active])) selectedMap[active] = [];

    const exists = poolMap[active].some((x) => String(x).toLowerCase() === input.toLowerCase());
    if (exists) return toastr.info('玩家已存在');

    poolMap[active].push(input);
    selectedMap[active].push(input);

    this.setPlayerPoolByProfile(s, poolMap);
    this.setPlayerSelectedByProfile(s, selectedMap);
    this.saveSettings();

    $('#fgr-edit-player-input').val('');
    this.renderPlayerMultiSelect();
    toastr.success('已添加玩家：' + input);
},

removeSelectedPlayersFromPool() {
    const s = this.getSettings();
    const active = String(s.activePlayerProfileName || '').trim();
    if (!active) return toastr.warning('请先选择名单');

    const selectedValues = $('#fgr-edit-player-select').val();
    const targets = Array.isArray(selectedValues)
        ? selectedValues.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
    if (!targets.length) return toastr.warning('请先在下拉框里选中要移除的玩家');

    const targetSet = new Set(targets.map((x) => x.toLowerCase()));

    const poolMap = this.getPlayerPoolByProfile(s);
    const selectedMap = this.getPlayerSelectedByProfile(s);

    const oldPool = Array.isArray(poolMap[active]) ? poolMap[active] : [];
    const newPool = oldPool.filter((x) => !targetSet.has(String(x).toLowerCase()));

    const oldSelected = Array.isArray(selectedMap[active]) ? selectedMap[active] : [];
    const newSelected = oldSelected.filter((x) => !targetSet.has(String(x).toLowerCase()));

    poolMap[active] = newPool;
    selectedMap[active] = newSelected;

    this.setPlayerPoolByProfile(s, poolMap);
    this.setPlayerSelectedByProfile(s, selectedMap);
    this.saveSettings();

    this.renderPlayerMultiSelect();
    toastr.success('已移除选中玩家');
},

        ensureCharacterNamedProfile(settings) {
            const lib = this.getPlayerProfileLibrary(settings);
            const charName = this.getCurrentCharacterName();
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
                this.setPlayerProfileLibrary(settings, lib);
            }

            return { lib, changed };
        },

renderPlayerProfileSelect() {
    const s = this.getSettings();
    const ensured = this.ensureCharacterNamedProfile(s);
    const lib = ensured.lib;
    const active = String(s.activePlayerProfileName || '').trim();

    const $sel = $('#fgr-edit-profile-select');
    if (!$sel.length) return;

    $sel.empty();
    Object.keys(lib)
        .sort((a, b) => a.localeCompare(b))
        .forEach((name) => {
            const $opt = $('<option></option>');
            $opt.val(name);
            $opt.text(name);
            $sel.append($opt);
        });

    $sel.val(active);
    this.renderPlayerMultiSelect();

    if (ensured.changed) this.saveSettings();
},

refreshPlayerProfileUI() {
    this.renderPlayerProfileSelect();
    this.renderPlayerMultiSelect();
},

onProfileSelectChange() {
    const s = this.getSettings();
    const lib = this.getPlayerProfileLibrary(s);
    const name = String($('#fgr-edit-profile-select').val() || '').trim();
    if (!name) return;

    if (!Object.hasOwn(lib, name)) lib[name] = '';
    s.activePlayerProfileName = name;
    this.setPlayerProfileLibrary(s, lib);
    this.saveSettings();

    this.renderPlayerMultiSelect();
$('#fgr-edit-player-input').val('');
},

createProfile() {
    const s = this.getSettings();
    const lib = this.getPlayerProfileLibrary(s);

    const input = window.prompt('请输入新名单名称：', '新名单');
    if (input === null) return;

    const name = String(input || '').trim();
    if (!name) return toastr.warning('名单名称不能为空');
    if (Object.hasOwn(lib, name)) return toastr.warning('已存在同名名单');

    lib[name] = '';
    s.activePlayerProfileName = name;
    this.setPlayerProfileLibrary(s, lib);

    const poolMap = this.getPlayerPoolByProfile(s);
    const selectedMap = this.getPlayerSelectedByProfile(s);
    if (!Array.isArray(poolMap[name])) poolMap[name] = [];
    if (!Array.isArray(selectedMap[name])) selectedMap[name] = [];
    this.setPlayerPoolByProfile(s, poolMap);
    this.setPlayerSelectedByProfile(s, selectedMap);

    this.saveSettings();
    this.renderPlayerProfileSelect();
    toastr.success('已新建名单：' + name);
},

renameProfile() {
    const s = this.getSettings();
    const lib = this.getPlayerProfileLibrary(s);
    const oldName = String($('#fgr-edit-profile-select').val() || '').trim();
    if (!oldName) return toastr.warning('请先选择一个名单');

    const input = window.prompt('请输入新名称：', oldName);
    if (input === null) return;
    const newName = String(input || '').trim();

    if (!newName) return toastr.warning('新名称不能为空');
    if (newName === oldName) return;
    if (Object.hasOwn(lib, newName)) return toastr.warning('已存在同名名单');

    lib[newName] = String(lib[oldName] || '');
    delete lib[oldName];
    s.activePlayerProfileName = newName;
    this.setPlayerProfileLibrary(s, lib);

    const poolMap = this.getPlayerPoolByProfile(s);
    const selectedMap = this.getPlayerSelectedByProfile(s);

    poolMap[newName] = Array.isArray(poolMap[oldName]) ? poolMap[oldName] : [];
    selectedMap[newName] = Array.isArray(selectedMap[oldName]) ? selectedMap[oldName] : [];
    delete poolMap[oldName];
    delete selectedMap[oldName];

    this.setPlayerPoolByProfile(s, poolMap);
    this.setPlayerSelectedByProfile(s, selectedMap);

    this.saveSettings();
    this.renderPlayerProfileSelect();
    toastr.success(`已重命名：${oldName} → ${newName}`);
},

deleteProfile() {
    const s = this.getSettings();
    const lib = this.getPlayerProfileLibrary(s);
    const name = String($('#fgr-edit-profile-select').val() || '').trim();
    if (!name) return toastr.warning('请先选择一个名单');

    const names = Object.keys(lib);
    if (names.length <= 1) return toastr.warning('至少保留一个名单');

    if (!window.confirm(`确定删除名单「${name}」吗？`)) return;

    delete lib[name];

    const poolMap = this.getPlayerPoolByProfile(s);
    const selectedMap = this.getPlayerSelectedByProfile(s);
    delete poolMap[name];
    delete selectedMap[name];

    const nextName = Object.keys(lib)[0];
    s.activePlayerProfileName = nextName;
    this.setPlayerProfileLibrary(s, lib);
    this.setPlayerPoolByProfile(s, poolMap);
    this.setPlayerSelectedByProfile(s, selectedMap);

    this.saveSettings();
    this.renderPlayerProfileSelect();
    toastr.success('已删除名单：' + name);
},

        useCurrentCharacterProfile() {
            const s = this.getSettings();
            const lib = this.getPlayerProfileLibrary(s);
            const charName = this.getCurrentCharacterName();

            if (!charName) return toastr.warning('当前不是角色聊天，无法按角色名切换');

            if (!Object.hasOwn(lib, charName)) {
                lib[charName] = '';
            }
            s.activePlayerProfileName = charName;
            this.setPlayerProfileLibrary(s, lib);
            this.saveSettings();
            this.renderPlayerProfileSelect();
            toastr.success('已切换到角色名单：' + charName);
        },

        getCharacterScopedManualPlayers() {
            const c = SillyTavern.getContext();
            const chid = c.characterId;
            if (typeof chid !== 'number' || chid < 0) return null;

            const ch = c.characters?.[chid];
            const v = ch?.data?.extensions?.[this.characterProfileKey]?.manualPlayers;
            return typeof v === 'string' ? v : null;
        },

        async saveCharacterScopedManualPlayers(value) {
            const c = SillyTavern.getContext();
            const chid = c.characterId;
            if (typeof chid !== 'number' || chid < 0) return false;

            await c.writeExtensionField(chid, this.characterProfileKey, {
                manualPlayers: String(value || ''),
            });
            return true;
        },

        init(opts) {
            if (this.inited) return;
            this.getSettings = opts.getSettings;
            this.getChatState = opts.getChatState;
            this.saveSettings = opts.saveSettings;
            this.saveMetadata = opts.saveMetadata || null;
            this.validateFlightMapJson = opts.validateFlightMapJson;

            const storedTab = String(localStorage.getItem(LAST_TAB_STORAGE_KEY) || '').trim();
            if (storedTab) {
                this.lastTab = storedTab;
            }

            if (globalThis.FGR_LUDO_UI?.register) {
                globalThis.FGR_LUDO_UI.register(this);
            }

this.ensureControlModal();
if (this.ensureCellEditorModal) this.ensureCellEditorModal();
            $(window).on('resize.fgrBoard', () => {
                if (this.renderBoardCanvas) this.renderBoardCanvas();
                if ($('#fgr-tab-card').hasClass('active')) {
                    this.applyCardLayout(true);
                }
            });
            this.inited = true;
        },

        ensureControlModal() {
            if ($('#fgr-control-modal').length) return;

            $('body').append(`
<div id="fgr-control-modal">
  <div class="fgr-card">

    <div class="fgr-fixed-topbar">
      <button class="menu_button fgr-icon-btn active" data-tab="map" type="button" title="地图" aria-label="地图">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 5L9 2L15 5L21.303 2.2987C21.5569 2.18992 21.8508 2.30749 21.9596 2.56131C21.9862 2.62355 22 2.69056 22 2.75827V19L15 22L9 19L2.69696 21.7013C2.44314 21.8101 2.14921 21.6925 2.04043 21.4387C2.01375 21.3765 2 21.3094 2 21.2417V5ZM16 19.3955L20 17.6812V5.03308L16 6.74736V19.3955ZM14 19.2639V6.73607L10 4.73607V17.2639L14 19.2639ZM8 17.2526V4.60451L4 6.31879V18.9669L8 17.2526Z"></path></svg>
      </button>

      <button class="menu_button fgr-icon-btn" data-tab="card" type="button" title="抽牌" aria-label="抽牌">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-spade-icon lucide-spade"><path d="M12 18v4"/><path d="M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5"/></svg>
      </button>

      <button class="menu_button fgr-icon-btn" data-tab="edit" type="button" title="编辑" aria-label="编辑">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 18.89H6.41421L15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89ZM21 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L9.24264 18.89H21V20.89ZM15.7279 6.74785L17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785Z"></path></svg>
      </button>

      <button class="menu_button fgr-icon-btn" data-tab="settings" type="button" title="设置" aria-label="设置">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3.33946 17.0002C2.90721 16.2515 2.58277 15.4702 2.36133 14.6741C3.3338 14.1779 3.99972 13.1668 3.99972 12.0002C3.99972 10.8345 3.3348 9.824 2.36353 9.32741C2.81025 7.71651 3.65857 6.21627 4.86474 4.99001C5.7807 5.58416 6.98935 5.65534 7.99972 5.072C9.01009 4.48866 9.55277 3.40635 9.4962 2.31604C11.1613 1.8846 12.8847 1.90004 14.5031 2.31862C14.4475 3.40806 14.9901 4.48912 15.9997 5.072C17.0101 5.65532 18.2187 5.58416 19.1346 4.99007C19.7133 5.57986 20.2277 6.25151 20.66 7.00021C21.0922 7.7489 21.4167 8.53025 21.6381 9.32628C20.6656 9.82247 19.9997 10.8336 19.9997 12.0002C19.9997 13.166 20.6646 14.1764 21.6359 14.673C21.1892 16.2839 20.3409 17.7841 19.1347 19.0104C18.2187 18.4163 17.0101 18.3451 15.9997 18.9284C14.9893 19.5117 14.4467 20.5941 14.5032 21.6844C12.8382 22.1158 11.1148 22.1004 9.49633 21.6818C9.55191 20.5923 9.00929 19.5113 7.99972 18.9284C6.98938 18.3451 5.78079 18.4162 4.86484 19.0103C4.28617 18.4205 3.77172 17.7489 3.33946 17.0002ZM8.99972 17.1964C10.0911 17.8265 10.8749 18.8227 11.2503 19.9659C11.7486 20.0133 12.2502 20.014 12.7486 19.9675C13.1238 18.8237 13.9078 17.8268 14.9997 17.1964C16.0916 16.5659 17.347 16.3855 18.5252 16.6324C18.8146 16.224 19.0648 15.7892 19.2729 15.334C18.4706 14.4373 17.9997 13.2604 17.9997 12.0002C17.9997 10.74 18.4706 9.5632 19.2729 8.6665C19.1688 8.4405 19.0538 8.21822 18.9279 8.00021C18.802 7.78219 18.667 7.57148 18.5233 7.36842C17.3457 7.61476 16.0911 7.43414 14.9997 6.80405C13.9083 6.17395 13.1246 5.17768 12.7491 4.03455C12.2509 3.98714 11.7492 3.98646 11.2509 4.03292C10.8756 5.17671 10.0916 6.17364 8.99972 6.80405C7.9078 7.43447 6.65245 7.61494 5.47428 7.36803C5.18485 7.77641 4.93463 8.21117 4.72656 8.66637C5.52881 9.56311 5.99972 10.74 5.99972 12.0002C5.99972 13.2604 5.52883 14.4372 4.72656 15.3339C4.83067 15.5599 4.94564 15.7822 5.07152 16.0002C5.19739 16.2182 5.3324 16.4289 5.47612 16.632C6.65377 16.3857 7.90838 16.5663 8.99972 17.1964ZM11.9997 15.0002C10.3429 15.0002 8.99972 13.6571 8.99972 12.0002C8.99972 10.3434 10.3429 9.00021 11.9997 9.00021C13.6566 9.00021 14.9997 10.3434 14.9997 12.0002C14.9997 13.6571 13.6566 15.0002 11.9997 15.0002ZM11.9997 13.0002C12.552 13.0002 12.9997 12.5525 12.9997 12.0002C12.9997 11.4479 12.552 11.0002 11.9997 11.0002C11.4474 11.0002 10.9997 11.4479 10.9997 12.0002C10.9997 12.5525 11.4474 13.0002 11.9997 13.0002Z"></path></svg>
      </button>

      <div class="fgr-topbar-spacer"></div>

      <button id="fgr-modal-close" class="menu_button fgr-icon-btn fgr-close-btn" type="button" title="关闭" aria-label="关闭">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z"></path></svg>
      </button>
    </div>

    <div class="fgr-body-scroll">
      <div id="fgr-tab-map" class="fgr-tab active">
        <div class="settings_section">
          <label>终点格（winPosition）</label>
          <input id="fgr-map-win-position" class="text_pole" type="number" min="1" step="1" />
        </div>

        <div class="settings_section">
          <label>可选地图</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="fgr-map-select" class="text_pole" style="flex:1;"></select>

            <button id="fgr-map-import-icon" class="menu_button" type="button" title="导入地图/地图包" aria-label="导入地图/地图包">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/></svg>
            </button>

            <button id="fgr-map-export-icon" class="menu_button" type="button" title="导出地图/地图包" aria-label="导出地图/地图包">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.5"/><path d="M2 13h10"/><path d="m5 10-3 3 3 3"/></svg>
            </button>

            <button id="fgr-map-rename-icon" class="menu_button" type="button" title="重命名地图" aria-label="重命名地图">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89H6.41421L15.7279 9.57627ZM17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785L17.1421 8.16206ZM7.24264 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L7.24264 20.89Z"></path></svg>
            </button>

            <button id="fgr-map-delete-icon" class="menu_button" type="button" title="删除地图" aria-label="删除地图">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8ZM7 5V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V5H22V7H2V5H7ZM9 4V5H15V4H9ZM9 12V18H11V12H9ZM13 12V18H15V12H13Z"></path></svg>
            </button>
          </div>
          <input id="fgr-map-import-file" type="file" accept=".json,application/json" style="display:none;" />
        </div>

        <div id="fgr-board-wrap">
          <canvas id="fgr-board-canvas"></canvas>

          <div id="fgr-board-dice" title="点击摇骰" aria-label="点击摇骰" role="button" tabindex="0">
            <div class="fgr-cup-glass">
              <div class="fgr-cup-dice-row">
                <div id="fgr-board-die-1" class="fgr-die face-1">
                  <i class="fgr-pip fgr-p1"></i><i class="fgr-pip fgr-p2"></i><i class="fgr-pip fgr-p3"></i>
                  <i class="fgr-pip fgr-p4"></i><i class="fgr-pip fgr-p5"></i><i class="fgr-pip fgr-p6"></i><i class="fgr-pip fgr-p7"></i>
                </div>
                <div id="fgr-board-die-2" class="fgr-die face-1" style="display:none;">
                  <i class="fgr-pip fgr-p1"></i><i class="fgr-pip fgr-p2"></i><i class="fgr-pip fgr-p3"></i>
                  <i class="fgr-pip fgr-p4"></i><i class="fgr-pip fgr-p5"></i><i class="fgr-pip fgr-p6"></i><i class="fgr-pip fgr-p7"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings_section">
          <label>点击摇骰子动画速度</label>
          <select id="fgr-map-anim-speed" class="text_pole">
            <option value="1200">快速</option>
            <option value="2200">中速</option>
            <option value="3600">慢速</option>
          </select>
        </div>

        <div class="fgr-map-legend">
          <span><i class="fgr-dot start"></i>起点</span>
          <span><i class="fgr-dot end"></i>终点</span>
          <span><i class="fgr-dot event"></i>有事件</span>
          <span><i class="fgr-dot selected"></i>当前选中</span>
          <span><i class="fgr-dot piece"></i>玩家棋子</span>
        </div>

        <div id="fgr-piece-list" class="fgr-piece-list"></div>
        <div class="fgr-map-tip">提示：点击棋盘格子可快速编辑该格事件；棋子位置来自当前聊天元数据。</div>

        <div class="settings_section" id="fgr-director-section">
          <label>导演编辑（简化回合包）</label>
          <table>
            <thead><tr><th>玩家</th><th>落点</th><th>事件文本（自动）</th></tr></thead>
            <tbody id="fgr-director-rows"></tbody>
          </table>
          <div class="fgr-map-toolbar" style="margin-top:8px;">
            <button id="fgr-director-apply" class="menu_button" type="button">应用到回合包</button>
            <button id="fgr-director-refresh" class="menu_button" type="button">刷新</button>
          </div>
          <div class="fgr-map-tip">说明：修改落点后会自动替换事件文本，并覆盖本回合提示词。</div>
        </div>

        <div class="settings_section fgr-map-toolbar">
          <button id="fgr-map-render" class="menu_button fgr-icon-btn" type="button" title="重绘棋盘" aria-label="重绘棋盘">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.25144 4 6.82508 5.38626 5.38443 7.5H8V9.5H2V3.5H4V5.99936C5.82381 3.57166 8.72764 2 12 2C17.5228 2 22 6.47715 22 12H20C20 7.58172 16.4183 4 12 4ZM4 12C4 16.4183 7.58172 20 12 20C14.7486 20 17.1749 18.6137 18.6156 16.5H16V14.5H22V20.5H20V18.0006C18.1762 20.4283 15.2724 22 12 22C6.47715 22 2 17.5228 2 12H4Z"></path></svg>
          </button>

          <button id="fgr-map-reset-progress" class="menu_button fgr-icon-btn" type="button" title="重置本聊天棋子进度" aria-label="重置本聊天棋子进度">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>

          <button id="fgr-round-undo" class="menu_button fgr-icon-btn" type="button" title="回退上一回合" aria-label="回退上一回合">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7.82843 11H20V13H7.82843L13.1924 18.364L11.7782 19.7782L4 12L11.7782 4.22183L13.1924 5.63604L7.82843 11Z"></path></svg>
          </button>

          <button id="fgr-round-redo" class="menu_button fgr-icon-btn" type="button" title="前进下一回合" aria-label="前进下一回合">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.1716 11H4V13H16.1716L10.8076 18.364L12.2218 19.7782L20 12L12.2218 4.22183L10.8076 5.63604L16.1716 11Z"></path></svg>
          </button>

          <button id="fgr-map-add-row" class="menu_button fgr-icon-btn" type="button" title="新增格子事件" aria-label="新增格子事件">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM11 11H7V13H11V17H13V13H17V11H13V7H11V11Z"></path></svg>
          </button>

          <button id="fgr-map-save" class="menu_button fgr-icon-btn" type="button" title="保存地图(覆盖当前选中)" aria-label="保存地图(覆盖当前选中)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H17L20.7071 6.70711C20.8946 6.89464 21 7.149 21 7.41421V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM12 18C13.6569 18 15 16.6569 15 15C15 13.3431 13.6569 12 12 12C10.3431 12 9 13.3431 9 15C9 16.6569 10.3431 18 12 18ZM5 5V9H15V5H5Z"></path></svg>
          </button>
        </div>

        <div class="settings_section">
          <table>
            <thead><tr><th>at</th><th>move</th><th>text</th><th>操作</th></tr></thead>
            <tbody id="fgr-map-rows"></tbody>
          </table>
        </div>
      </div>

      <div id="fgr-tab-card" class="fgr-tab">
        <div class="settings_section">
          <label>国王游戏抽牌（点击一张牌即为 user 下一轮牌面）</label>
          <div class="fgr-map-toolbar">
            <button id="fgr-card-shuffle" class="menu_button fgr-icon-btn" type="button" title="洗牌" aria-label="洗牌">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.25144 4 6.82508 5.38626 5.38443 7.5H8V9.5H2V3.5H4V5.99936C5.82381 3.57166 8.72764 2 12 2C17.5228 2 22 6.47715 22 12H20C20 7.58172 16.4183 4 12 4ZM4 12C4 16.4183 7.58172 20 12 20C14.7486 20 17.1749 18.6137 18.6156 16.5H16V14.5H22V20.5H20V18.0006C18.1762 20.4283 15.2724 22 12 22C6.47715 22 2 17.5228 2 12H4Z"></path></svg>
            </button>

            <button id="fgr-card-reset-progress" class="menu_button fgr-icon-btn" type="button" title="重置国王回合进度" aria-label="重置国王回合进度">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>

            <button id="fgr-card-round-undo" class="menu_button fgr-icon-btn" type="button" title="回退上一回合" aria-label="回退上一回合">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7.82843 11H20V13H7.82843L13.1924 18.364L11.7782 19.7782L4 12L11.7782 4.22183L13.1924 5.63604L7.82843 11Z"></path></svg>
            </button>

            <button id="fgr-card-round-redo" class="menu_button fgr-icon-btn" type="button" title="前进下一回合" aria-label="前进下一回合">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.1716 11H4V13H16.1716L10.8076 18.364L12.2218 19.7782L20 12L12.2218 4.22183L10.8076 5.63604L16.1716 11Z"></path></svg>
            </button>
          </div>
        </div>

        <div id="fgr-card-players-tip" class="fgr-map-tip"></div>
        <div id="fgr-card-grid" class="fgr-card-grid"></div>
        <div class="fgr-map-tip">说明：可手动点洗牌按钮洗牌。点击任意牌会翻牌并进入下一轮国王游戏。</div>
      </div>

      <div id="fgr-tab-edit" class="fgr-tab">
        <div class="settings_section">
          <label>玩家名单（按角色名自动切换）</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="fgr-edit-profile-select" class="text_pole" style="flex:1;"></select>

            <button id="fgr-edit-profile-use-char" class="menu_button fgr-icon-btn" type="button" title="切到当前角色" aria-label="切到当前角色">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C14.7486 4 17.1749 5.38626 18.6156 7.5H16V9.5H22V3.5H20V5.99936C18.1762 3.57166 15.2724 2 12 2C6.47715 2 2 6.47715 2 12H4C4 7.58172 7.58172 4 12 4ZM20 12C20 16.4183 16.4183 20 12 20C9.25144 20 6.82508 18.6137 5.38443 16.5H8V14.5H2V20.5H4V18.0006C5.82381 20.4283 8.72764 22 12 22C17.5228 22 22 17.5228 22 12H20Z"></path></svg>
            </button>

            <button id="fgr-edit-profile-create" class="menu_button fgr-icon-btn" type="button" title="新建名单" aria-label="新建名单">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM11 11H7V13H11V17H13V13H17V11H13V7H11V11Z"></path></svg>
            </button>

            <button id="fgr-edit-profile-rename" class="menu_button fgr-icon-btn" type="button" title="重命名名单" aria-label="重命名名单">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89H6.41421L15.7279 9.57627ZM17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785L17.1421 8.16206ZM7.24264 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L7.24264 20.89Z"></path></svg>
            </button>

            <button id="fgr-edit-profile-delete" class="menu_button fgr-icon-btn" type="button" title="删除名单" aria-label="删除名单">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8ZM7 5V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V5H22V7H2V5H7ZM9 4V5H15V4H9ZM9 12V18H11V12H9ZM13 12V18H15V12H13Z"></path></svg>
            </button>

            <button id="fgr-edit-save" class="menu_button fgr-icon-btn" type="button" title="保存编辑配置" aria-label="保存编辑配置">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H17L20.7071 6.70711C20.8946 6.89464 21 7.149 21 7.41421V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM12 18C13.6569 18 15 16.6569 15 15C15 13.3431 13.6569 12 12 12C10.3431 12 9 13.3431 9 15C9 16.6569 10.3431 18 12 18ZM5 5V9H15V5H5Z"></path></svg>
            </button>
          </div>
        </div>

        <div class="settings_section">
          <label>玩家池（添加可选玩家）</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="fgr-edit-player-input" class="text_pole" type="text" placeholder="输入玩家名，如：Alice" style="flex:1;" />
            <button id="fgr-edit-player-add" class="menu_button fgr-icon-btn" type="button" title="添加玩家" aria-label="添加玩家">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path></svg>
            </button>
            <button id="fgr-edit-player-remove" class="menu_button fgr-icon-btn" type="button" title="移除已选玩家" aria-label="移除已选玩家">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 11H19V13H5V11Z"></path></svg>
            </button>
          </div>
        </div>

        <div class="settings_section">
          <label>本轮参赛玩家（可多选）</label>
          <select id="fgr-edit-player-select" class="text_pole" multiple size="8" style="width:100%;"></select>
        </div>
        <div class="settings_section"><label>User别名</label><input id="fgr-edit-user-aliases" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>User统一名</label><input id="fgr-edit-user-canonical-name" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>黑名单</label><input id="fgr-edit-name-blacklist" class="text_pole" type="text" /></div>
      </div>

      <div id="fgr-tab-settings" class="fgr-tab">
<div class="settings_section"><label>下一回合触发词</label><input id="fgr-set-round-trigger" class="text_pole" type="text" /></div>
<div class="settings_section"><label>飞行棋启动词</label><input id="fgr-set-flight-start" class="text_pole" type="text" /></div>
<div class="settings_section"><label>飞行棋重开词</label><input id="fgr-set-flight-replay" class="text_pole" type="text" /></div>

<div class="settings_section"><label>国王游戏启动词</label><input id="fgr-set-king-start" class="text_pole" type="text" /></div>

        <div class="settings_section">
          <label>骰子数量模式</label>
          <select id="fgr-set-dice-count-mode" class="text_pole">
            <option value="auto">自动（按玩家数切换）</option>
            <option value="fixed">固定（手动指定）</option>
          </select>
        </div>

        <div class="settings_section">
          <label>固定模式骰子颗数（1~2）</label>
          <input id="fgr-set-dice-fixed-count" class="text_pole" type="number" min="1" max="2" step="1" />
        </div>

        <div class="settings_section">
          <label>自动模式切换阈值（玩家数达到该值用2d6）</label>
          <input id="fgr-set-dice-auto-switch-player-count" class="text_pole" type="number" min="2" step="1" />
        </div>

        <div class="settings_section">
          <label>结果模式</label>
          <select id="fgr-set-fairness-mode" class="text_pole">
            <option value="strict">严格公平</option>
            <option value="director">导演模式</option>
          </select>
        </div>

        <hr class="sysHR" />
        <div class="settings_section"><label>地图JSON（高级）</label><textarea id="fgr-set-flight-map-json" class="text_pole" rows="7"></textarea></div>
        <div class="settings_section flex-container">
          <button id="fgr-set-validate-map" class="menu_button fgr-icon-btn" type="button" title="校验JSON" aria-label="校验JSON">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>
          </button>
          <button id="fgr-set-save" class="menu_button fgr-icon-btn" type="button" title="保存设置" aria-label="保存设置">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H17L20.7071 6.70711C20.8946 6.89464 21 7.149 21 7.41421V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM12 18C13.6569 18 15 16.6569 15 15C15 13.3431 13.6569 12 12 12C10.3431 12 9 13.3431 9 15C9 16.6569 10.3431 18 12 18ZM5 5V9H15V5H5Z"></path></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
            `);

            $('body').append(`
<div id="fgr-director-quick-modal" style="display:none;position:fixed;inset:0;z-index:35050;background:rgba(0,0,0,.45);align-items:flex-start;justify-content:center;padding-top:120px;padding-left:16px;padding-right:16px;box-sizing:border-box;">
  <div class="fgr-director-quick-card" style="width:min(720px,95vw);max-height:calc(100vh - 140px);overflow:auto;background:var(--SmartThemeBlurTintColor,rgba(30,30,30,.96));border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.15));border-radius:12px;padding:14px;backdrop-filter:blur(10px);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <div style="font-weight:700;">导演编辑（独立面板）</div>
      <div style="flex:1;"></div>
      <button id="fgr-director-quick-close" class="menu_button" type="button">关闭</button>
    </div>

    <table>
      <thead><tr><th>玩家</th><th>落点</th><th>事件文本（自动）</th></tr></thead>
      <tbody id="fgr-director-quick-rows"></tbody>
    </table>

    <div class="fgr-map-toolbar" style="margin-top:8px;">
      <button id="fgr-director-quick-apply" class="menu_button" type="button">应用到回合包</button>
      <button id="fgr-director-quick-refresh" class="menu_button" type="button">刷新</button>
    </div>
    <div class="fgr-map-tip">说明：修改落点后会自动替换事件文本，并覆盖本回合提示词。</div>
  </div>
</div>
            `);

            $('#fgr-modal-close').on('click', () => this.close());
            $('#fgr-control-modal').on('click', (e) => {
                if (e.target && e.target.id === 'fgr-control-modal') this.close();
            });
            $(document).on('keydown.fgrModal', (e) => {
                if (e.key === 'Escape') {
                    this.close();
                    this.closeDirectorOnlyModal();
                }
            });

            $('.fgr-icon-btn[data-tab]').on('click', (e) =>
                this.switchTab($(e.currentTarget).data('tab'))
            );

            $('#fgr-map-add-row').on('click', () => this.addMapRow());
            $('#fgr-map-save').on('click', () => this.saveMapFromVisual());
            $('#fgr-map-render').on('click', () => this.renderBoardCanvas());
            $('#fgr-map-reset-progress').on('click', () => this.resetFlightProgress());
            $('#fgr-director-apply').on('click', async () => this.applyDirectorEdits());
            $('#fgr-director-refresh').on('click', () => this.renderDirectorEditor());
            $('#fgr-director-rows').on('input', '.fgr-director-pos', (e) =>
                this.updateDirectorRowEvent(e)
            );
            $('#fgr-director-quick-apply').on('click', async () => this.applyDirectorEdits());
            $('#fgr-director-quick-refresh').on('click', () =>
                this.renderDirectorEditor('#fgr-director-quick-rows')
            );
            $('#fgr-director-quick-rows').on('input', '.fgr-director-pos', (e) =>
                this.updateDirectorRowEvent(e)
            );
            $('#fgr-director-quick-close').on('click', () => this.closeDirectorOnlyModal());
            $('#fgr-director-quick-modal').on('click', (e) => {
                if (e.target && e.target.id === 'fgr-director-quick-modal')
                    this.closeDirectorOnlyModal();
            });

            $('#fgr-card-shuffle').on('click', async () => {
                await this.shuffleCardGrid();
            });
            $('#fgr-card-reset-progress').on('click', async () => {
                await this.handleKingResetProgress();
            });
            $('#fgr-card-round-undo').on('click', async () => {
                await this.handleUndoRound();
            });
            $('#fgr-card-round-redo').on('click', async () => {
                await this.handleRedoRound();
            });

            $('#fgr-card-grid').on('click', '.fgr-poker-card', async (e) => {
                const $card = $(e.currentTarget);
                await this.pickCardAndStartKingRound($card);
            });
            $('#fgr-card-grid').on('keydown', '.fgr-poker-card', async (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                const $card = $(e.currentTarget);
                await this.pickCardAndStartKingRound($card);
            });

            $('#fgr-king-director-close').on('click', () => this.closeKingDirectorModal());
            $('#fgr-king-director-modal').on('click', (e) => {
                if (e.target && e.target.id === 'fgr-king-director-modal')
                    this.closeKingDirectorModal();
            });
            $('#fgr-king-director-refresh').on('click', () => this.renderKingDirectorRows());
            $('#fgr-king-director-apply').on('click', async () =>
                this.applyKingDirectorFromModal()
            );

            $('#fgr-round-undo').on('click', async () => {
                await this.handleUndoRound();
            });
            $('#fgr-round-redo').on('click', async () => {
                await this.handleRedoRound();
            });

            $('#fgr-map-import-icon').on('click', () => $('#fgr-map-import-file').trigger('click'));
            $('#fgr-map-export-icon').on('click', () => this.exportByChoice());
            $('#fgr-map-rename-icon').on('click', () => this.renameSelectedMap());
            $('#fgr-map-delete-icon').on('click', () => this.deleteSelectedMap());

            $('#fgr-map-import-file').on('change', (e) => this.importMapFile(e));

            $('#fgr-board-dice').on('click', async () => {
                await this.handleRollClick();
            });

            $('#fgr-board-dice').on('keydown', async (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    await this.handleRollClick();
                }
            });

            $('#fgr-map-anim-speed').on('change', () => this.quickSaveAnimSpeed());

            $('#fgr-map-select').on('change', (e) => {
                const name = String($(e.target).val() || '');
                this.switchActiveMap(name, true);
            });

            $('#fgr-map-win-position').on('input', () => this.renderBoardCanvas());
            $('#fgr-map-rows').on('input', '.fgr-at, .fgr-move, .fgr-text', () =>
                this.renderBoardCanvas()
            );
            $('#fgr-board-canvas').on('click', (e) => this.onCanvasClick(e));

            $(
                '#fgr-set-dice-count-mode, #fgr-set-dice-fixed-count, #fgr-set-dice-auto-switch-player-count'
            ).on('change input', () => this.quickSaveDiceSettings());

            $('#fgr-edit-save').on('click', async () => {
                await this.saveEditTab();
            });
            $('#fgr-edit-profile-select').on('change', () => this.onProfileSelectChange());
            $('#fgr-edit-profile-create').on('click', () => this.createProfile());
            $('#fgr-edit-profile-rename').on('click', () => this.renameProfile());
            $('#fgr-edit-profile-delete').on('click', () => this.deleteProfile());
            $('#fgr-edit-profile-use-char').on('click', () => this.useCurrentCharacterProfile());

            $('#fgr-edit-player-add').on('click', () => this.addPlayerToPool());
            $('#fgr-edit-player-remove').on('click', () => this.removeSelectedPlayersFromPool());
            $('#fgr-edit-player-select').on('change', () => this.onPlayerMultiSelectChange());
            $('#fgr-edit-player-input').on('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addPlayerToPool();
                }
            });

            $('#fgr-set-save').on('click', () => this.saveSettingsTab());
            $('#fgr-set-validate-map').on('click', () => this.validateMapInTab());
        },

        quickSaveDiceSettings() {
            const s = this.getSettings();
            s.diceCountMode = this.normalizeDiceMode($('#fgr-set-dice-count-mode').val());

            {
                const fixed = Math.trunc(Number($('#fgr-set-dice-fixed-count').val()));
                s.diceFixedCount = Number.isFinite(fixed) ? Math.min(2, Math.max(1, fixed)) : 1;
            }

            {
                const threshold = Math.trunc(
                    Number($('#fgr-set-dice-auto-switch-player-count').val())
                );
                s.diceAutoSwitchPlayerCount = Number.isFinite(threshold)
                    ? Math.max(2, threshold)
                    : 6;
            }

            this.saveSettings();
        },

        switchTab(tab) {
            const t = String(tab || 'map').trim() || 'map';
            this.lastTab = t;
            localStorage.setItem(LAST_TAB_STORAGE_KEY, t);

            $('.fgr-icon-btn[data-tab]').removeClass('active');
            $('.fgr-icon-btn[data-tab="' + t + '"]').addClass('active');
            $('.fgr-tab').removeClass('active');
            $('#fgr-tab-' + t).addClass('active');

            if (t === 'map') this.renderBoardCanvas();
            if (t === 'card') this.renderCardDrawTab({ autoShuffle: false, forceRebuild: true });
        },

        getKingCardPoolByCount(count) {
            const n = Math.max(2, Math.trunc(Number(count) || 2));
            const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            return ['王', ...ranks.slice(0, Math.max(1, n - 1))].slice(0, n);
        },

        async getResolvedPlayersForCard() {
            if (globalThis.FGR_ACTIONS?.getResolvedPlayersForUI) {
                const r = await globalThis.FGR_ACTIONS.getResolvedPlayersForUI();
                if (r && r.ok && Array.isArray(r.players)) return r.players;
            }
            const st = this.getChatState();
            if (Array.isArray(st?.players) && st.players.length) return st.players;
            return [];
        },

        waitMs(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },

        shuffleArray(list = []) {
            const arr = list.slice();
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        getCardLayout(count) {
            const n = Math.max(1, Math.trunc(Number(count) || 1));
            const $grid = $('#fgr-card-grid');
            const gridWidth = Math.max(280, Math.trunc($grid.innerWidth() || 0) || 280);
            const cardW = 92;
            const cardH = 132;
            const gap = 12;
            const cols = Math.max(1, Math.floor((gridWidth + gap) / (cardW + gap)));
            const rows = Math.ceil(n / cols);
            const slots = [];

            for (let i = 0; i < n; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                slots.push({
                    left: col * (cardW + gap),
                    top: row * (cardH + gap),
                });
            }

            const height = rows * cardH + Math.max(0, rows - 1) * gap;
            return {
                cardW,
                cardH,
                gap,
                cols,
                rows,
                width: gridWidth,
                height,
                slots,
            };
        },

        applyCardLayout(instant = false) {
            const $grid = $('#fgr-card-grid');
            const $cards = $grid.find('.fgr-poker-card');
            const layout = this.getCardLayout($cards.length);
            this.cardLayout = layout;

            $grid.css('height', `${layout.height}px`);

            $cards.each((idx, el) => {
                const slot = layout.slots[idx];
                const $el = $(el);

                if (instant) $el.addClass('no-transition');
                $el.css({
                    left: `${slot.left}px`,
                    top: `${slot.top}px`,
                    transform: 'rotate(0deg)',
                    zIndex: `${10 + idx}`,
                });

                if (instant) {
                    requestAnimationFrame(() => {
                        $el.removeClass('no-transition');
                    });
                }
            });
        },

        waitMs(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },

        shuffleArray(list = []) {
            const arr = list.slice();
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        randomSuit() {
            const suits = ['S', 'H', 'D', 'C'];
            return suits[Math.floor(Math.random() * suits.length)];
        },

        getCardArtPath(card, suit) {
            if (card === '王') {
                return `${EXT_PATH}/assets/cards/JOKER.svg`;
            }
            return `${EXT_PATH}/assets/cards/${card}${suit}.svg`;
        },

        makeCardVisuals(cards = []) {
            return cards.map((card) => {
                const suit = card === '王' ? 'JOKER' : this.randomSuit();
                const art =
                    card === '王'
                        ? this.getCardArtPath(card, suit)
                        : this.getCardArtPath(card, suit);
                return { card, suit, art };
            });
        },

        applyCardVisualToElement($el, visual) {
            const card = String(visual.card || '');
            const suit = String(visual.suit || '');
            const art = String(visual.art || '');

            $el.attr('data-card', card);
            $el.attr('data-suit', suit);

            if (art) {
                $el.find('.fgr-poker-art').attr('src', art);
            } else {
                $el.find('.fgr-poker-art').attr('src', '');
            }
        },

        ensureCardSfx() {
            if (!this.cardSfx.shuffle) {
                this.cardSfx.shuffle = new Audio(`${EXT_PATH}/assets/sfx/shuffle.mp3`);
                this.cardSfx.shuffle.volume = 0.6;
            }
            if (!this.cardSfx.flip) {
                this.cardSfx.flip = new Audio(`${EXT_PATH}/assets/sfx/flip.mp3`);
                this.cardSfx.flip.volume = 0.75;
            }
            if (!this.cardSfx.deal) {
                this.cardSfx.deal = new Audio(`${EXT_PATH}/assets/sfx/deal.mp3`);
                this.cardSfx.deal.volume = 0.65;
            }
        },

        playCardSfx(name) {
            try {
                this.ensureCardSfx();

                if (name === 'flip') {
                    const a = new Audio(`${EXT_PATH}/assets/sfx/flip.mp3`);
                    a.volume = 0.75;
                    a.play().catch(() => {});
                    return;
                }

                const audio = this.cardSfx[name];
                if (!audio) return;
                audio.pause();
                audio.currentTime = 0;
                audio.play().catch(() => {});
            } catch (_e) {}
        },

        getCardLayout(count) {
            const n = Math.max(1, Math.trunc(Number(count) || 1));
            const $grid = $('#fgr-card-grid');
            const gridWidth = Math.max(280, Math.trunc($grid.innerWidth() || 0) || 280);
            const cardW = 92;
            const cardH = 132;
            const gap = 12;
            const cols = Math.max(1, Math.floor((gridWidth + gap) / (cardW + gap)));
            const rows = Math.ceil(n / cols);
            const slots = [];

            for (let i = 0; i < n; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                slots.push({
                    left: col * (cardW + gap),
                    top: row * (cardH + gap),
                });
            }

            const height = rows * cardH + Math.max(0, rows - 1) * gap;
            return {
                cardW,
                cardH,
                gap,
                cols,
                rows,
                width: gridWidth,
                height,
                slots,
            };
        },

        applyCardLayout(instant = false) {
            const $grid = $('#fgr-card-grid');
            const $cards = $grid.find('.fgr-poker-card');
            const layout = this.getCardLayout($cards.length);
            this.cardLayout = layout;

            $grid.css('height', `${layout.height}px`);

            $cards.each((idx, el) => {
                const slot = layout.slots[idx];
                const $el = $(el);

                if (instant) $el.addClass('no-transition');
                $el.css({
                    left: `${slot.left}px`,
                    top: `${slot.top}px`,
                    transform: 'rotate(0deg)',
                    zIndex: `${10 + idx}`,
                });

                if (instant) {
                    requestAnimationFrame(() => {
                        $el.removeClass('no-transition');
                    });
                }
            });
        },

        async runCardCollectShuffleDealAnimation() {
            const $grid = $('#fgr-card-grid');
            const $cards = $grid.find('.fgr-poker-card');
            if (!$cards.length) return;

            const layout = this.cardLayout || this.getCardLayout($cards.length);
            const centerLeft = Math.max(0, (layout.width - layout.cardW) / 2);
            const centerTop = Math.max(0, (layout.height - layout.cardH) / 2);

            $cards.addClass('disabled').addClass('collecting');

            await this.waitMs(20);

            $cards.each((idx, el) => {
                const $el = $(el);
                const offsetX = ((idx % 6) - 2.5) * 3;
                const offsetY = ((Math.floor(idx / 6) % 3) - 1) * 3;
                const rot = (idx % 2 ? 1 : -1) * (4 + (idx % 4));

                $el.css({
                    left: `${centerLeft + offsetX}px`,
                    top: `${centerTop + offsetY}px`,
                    transform: `rotate(${rot}deg)`,
                    zIndex: `${200 + idx}`,
                });
            });

            await this.waitMs(650);

            $cards.removeClass('collecting').addClass('stack-shuffling');
            this.playCardSfx('shuffle');
            await this.waitMs(1100);
            $cards.removeClass('stack-shuffling');

            this.currentCardPool = this.shuffleArray(this.currentCardPool);
            this.currentCardVisuals = this.makeCardVisuals(this.currentCardPool);

            $cards.each((idx, el) => {
                const visual = this.currentCardVisuals[idx];
                const $el = $(el);
                this.applyCardVisualToElement($el, visual);
                $el.removeClass('flipped');
            });

            $cards.addClass('dealing');

            for (let i = 0; i < $cards.length; i++) {
                const el = $cards[i];
                const slot = layout.slots[i];
                const $el = $(el);

                $el.css({ zIndex: `${300 + i}` });
                this.playCardSfx('deal');
                await this.waitMs(90);
                $el.css({
                    left: `${slot.left}px`,
                    top: `${slot.top}px`,
                    transform: 'rotate(0deg)',
                    zIndex: `${20 + i}`,
                });
            }

            await this.waitMs(420);
            $cards.removeClass('dealing');
            $cards.removeClass('disabled');
        },

        async renderCardDrawTab(options = {}) {
            if (this.cardBusy) return;
            this.cardBusy = true;

            try {
                const autoShuffle = !!options.autoShuffle;
                const forceRebuild = !!options.forceRebuild;

                let needBuild = forceRebuild;
                const $grid = $('#fgr-card-grid');
                if (!$grid.find('.fgr-poker-card').length) needBuild = true;

                const players = await this.getResolvedPlayersForCard();
                const cards = this.getKingCardPoolByCount(players.length || 2);

                const tip = players.length
                    ? `当前玩家：${players.join('、')}（共${players.length}人）`
                    : '当前未识别到玩家，默认展示2张牌。请先在聊天里确保玩家名单可识别。';
                $('#fgr-card-players-tip').text(tip);

                if (needBuild) {
                    this.currentCardPool = cards.slice();
                    this.currentCardVisuals = this.makeCardVisuals(this.currentCardPool);

                    $grid.empty();
                    this.currentCardVisuals.forEach((visual) => {
                        const $card = $(`
<div class="fgr-poker-card" data-card="${visual.card}" role="button" tabindex="0" aria-label="扑克牌">
  <div class="fgr-poker-inner">
    <div class="fgr-poker-face fgr-poker-back">
      <span>♠</span>
    </div>
    <div class="fgr-poker-face fgr-poker-front">
      <img class="fgr-poker-art" src="" alt="card" />
    </div>
  </div>
</div>
                        `);
                        this.applyCardVisualToElement($card, visual);
                        $grid.append($card);
                    });

                    this.applyCardLayout(true);
                    await this.waitMs(20);
                } else {
                    this.applyCardLayout(true);
                }

                if (autoShuffle) {
                    await this.runCardCollectShuffleDealAnimation();
                }
            } finally {
                this.cardBusy = false;
            }
        },

        async shuffleCardGrid() {
            if (this.cardBusy) return;
            this.cardBusy = true;
            try {
                if (!$('#fgr-card-grid .fgr-poker-card').length) {
                    await this.renderCardDrawTab({ autoShuffle: false, forceRebuild: true });
                    return;
                }
                this.applyCardLayout(true);
                await this.waitMs(20);
                await this.runCardCollectShuffleDealAnimation();
            } finally {
                this.cardBusy = false;
            }
        },

        async pickCardAndStartKingRound($card) {
            if (this.cardBusy) return;
            if (!$card || !$card.length) return;

            this.cardBusy = true;

            const card = String($card.attr('data-card') || '').trim();
            if (!card) {
                this.cardBusy = false;
                return;
            }

            const $allCards = $('#fgr-card-grid .fgr-poker-card');

            $allCards.addClass('disabled');
            this.playCardSfx('flip');
            $card.addClass('flipped');

            await this.waitMs(560);

            if (globalThis.FGR_ACTIONS?.setKingPresetUserCard) {
                const presetRes = await globalThis.FGR_ACTIONS.setKingPresetUserCard(card);
                if (!presetRes?.ok) {
                    toastr.error('设置 user 预设牌失败');
                    $allCards.removeClass('disabled');
                    this.cardBusy = false;
                    return;
                }
            } else {
                toastr.error('缺少 setKingPresetUserCard 动作');
                $allCards.removeClass('disabled');
                this.cardBusy = false;
                return;
            }

            if (globalThis.FGR_ACTIONS?.rollKingByClick) {
                const rollRes = await globalThis.FGR_ACTIONS.rollKingByClick();
                if (!rollRes?.ok) {
                    toastr.error(rollRes?.error || '进入下一轮失败');
                    $allCards.removeClass('disabled');
                    this.cardBusy = false;
                    return;
                }
                toastr.success(`你抽到 ${card}，已进入国王游戏下一回合`);
            } else {
                toastr.error('缺少 rollKingByClick 动作');
                $allCards.removeClass('disabled');
                this.cardBusy = false;
                return;
            }

            this.cardBusy = false;
        },

        closeKingDirectorModal() {
            $('#fgr-king-director-modal').hide();
        },

        renderKingDirectorRows() {
            const packet = this.kingDirectorPacket || this.getChatState()?.pendingPacket || null;
            const $rows = $('#fgr-king-director-rows');
            $rows.empty();

            if (!packet || packet.gameType !== 'king') {
                $rows.append(`<tr><td colspan="2">当前无国王回合可编辑</td></tr>`);
                return;
            }

            const players = Array.isArray(packet.players) ? packet.players : [];
            const cards = this.getKingCardPoolByCount(players.length || 2);

            const presetMap = new Map();
            const oldAssign = Array.isArray(packet?.king?.assignments)
                ? packet.king.assignments
                : [];
            oldAssign.forEach((a) => {
                const p = String(a?.player || '').trim();
                const c = String(a?.card || '').trim();
                if (p && c) presetMap.set(c, p);
            });

            cards.forEach((card) => {
                const $tr = $('<tr></tr>');
                const $tdCard = $(`<td>${card}</td>`);
                const $tdSel = $(`<td></td>`);
                const $sel = $(
                    `<select class="text_pole fgr-king-player-select" data-card="${card}"></select>`
                );

                $sel.append(`<option value="">请选择玩家</option>`);
                players.forEach((p) => {
                    $sel.append(`<option value="${p}">${p}</option>`);
                });

                if (presetMap.has(card)) {
                    $sel.val(presetMap.get(card));
                }

                $tdSel.append($sel);
                $tr.append($tdCard, $tdSel);
                $rows.append($tr);
            });
        },

        async applyKingDirectorFromModal() {
            const packet = this.kingDirectorPacket || this.getChatState()?.pendingPacket || null;
            if (!packet || packet.gameType !== 'king') {
                return toastr.warning('当前没有国王回合可应用');
            }

            const assignments = [];
            const usedPlayers = new Set();

            $('#fgr-king-director-rows .fgr-king-player-select').each((_, el) => {
                const $el = $(el);
                const card = String($el.data('card') || '').trim();
                const player = String($el.val() || '').trim();
                if (card) assignments.push({ card, player });
            });

            if (!assignments.length) {
                return toastr.warning('请先指定牌面对应玩家');
            }

            for (const a of assignments) {
                if (!a.player) return toastr.warning(`牌 ${a.card} 未选择玩家`);
                if (usedPlayers.has(a.player)) {
                    return toastr.warning(`玩家 ${a.player} 被重复分配，请保证一人一张牌`);
                }
                usedPlayers.add(a.player);
            }

            if (globalThis.FGR_ACTIONS?.applyKingDirectorEdits) {
                const res = await globalThis.FGR_ACTIONS.applyKingDirectorEdits(assignments);
                if (!res?.ok) {
                    return toastr.error(res?.error || '应用国王导演编辑失败');
                }
                toastr.success('国王导演编辑已应用');
                this.closeKingDirectorModal();
                return;
            }

            toastr.error('缺少 applyKingDirectorEdits 动作');
        },

        loadFromSettings() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);

            const activeItem = this.findMapByName(lib, lib.active) || lib.items[0];
            s.flightMapJson = JSON.stringify(activeItem.map, null, 2);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(activeItem.map);

            this.renderPlayerProfileSelect();

            $('#fgr-edit-player-input').val('');
            $('#fgr-edit-user-aliases').val(s.userAliases);
            $('#fgr-edit-user-canonical-name').val(s.userCanonicalName);
            $('#fgr-edit-name-blacklist').val(s.nameBlacklist);

            $('#fgr-set-round-trigger').val(s.roundTriggerWords);
            $('#fgr-set-flight-start').val(s.flightStartKeywords);
            $('#fgr-set-flight-replay').val(s.flightReplayKeywords);
            $('#fgr-set-king-start').val(
                s.kingStartKeywords || '国王游戏,玩国王游戏,开始玩国王游戏'
            );

            const diceMode = this.normalizeDiceMode(s.diceCountMode || 'auto');
            $('#fgr-set-dice-count-mode').val(diceMode);
            $('#fgr-set-dice-fixed-count').val(
                Number.isFinite(Number(s.diceFixedCount))
                    ? Math.min(2, Math.max(1, Number(s.diceFixedCount)))
                    : 1
            );
            $('#fgr-set-dice-auto-switch-player-count').val(
                Number.isFinite(Number(s.diceAutoSwitchPlayerCount))
                    ? Math.max(2, Number(s.diceAutoSwitchPlayerCount))
                    : 6
            );

            $('#fgr-map-anim-speed').val(String(Number(s.clickAnimationMs) || 2200));
            $('#fgr-set-fairness-mode').val(s.fairnessMode);

            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            this.setMapLibrary(s, lib);
            this.saveSettings();
        },

open(tab) {
    const remembered =
        String(
            this.lastTab || localStorage.getItem(LAST_TAB_STORAGE_KEY) || 'map'
        ).trim() || 'map';
    const targetTab = remembered;

    try {
        const s = this.getSettings();
        const ensured = this.ensureCharacterNamedProfile(s);
        if (ensured.changed) {
            this.saveSettings();
        }

        this.loadFromSettings();
        this.switchTab(targetTab);
        this.renderDirectorEditor();
        $('#fgr-control-modal').css('display', 'flex');
    } catch (err) {
        console.error('[fair-game-referee] 打开面板失败', err);
        toastr.error('打开面板失败：' + (err && err.message ? err.message : err));
    }
},

        openDirectorPanel() {
            try {
                this.open('map');
                if (typeof this.renderDirectorEditor === 'function') {
                    this.renderDirectorEditor();
                }
                const el = document.getElementById('fgr-director-section');
                if (el && el.scrollIntoView) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (err) {
                console.error('[fair-game-referee] 打开导演编辑失败', err);
            }
        },

        close() {
            $('#fgr-control-modal').hide();
        },

        openDirectorOnlyModal() {
            try {
                if (typeof this.renderDirectorEditor === 'function') {
                    this.renderDirectorEditor('#fgr-director-quick-rows');
                }
                const $modal = $('#fgr-director-quick-modal');
                $modal.css('display', 'flex');
                requestAnimationFrame(() => {
                    $modal.addClass('show');
                });
            } catch (err) {
                console.error('[fair-game-referee] 打开导演独立面板失败', err);
            }
        },

        closeDirectorOnlyModal() {
            const $modal = $('#fgr-director-quick-modal');
            $modal.removeClass('show');
            setTimeout(() => {
                $modal.hide();
            }, 180);
        },

async saveEditTab() {
    const s = this.getSettings();

    s.userAliases = String($('#fgr-edit-user-aliases').val() || '');
    s.userCanonicalName = 'user';
    s.nameBlacklist = String($('#fgr-edit-name-blacklist').val() || '');

    this.onPlayerMultiSelectChange();
    this.saveSettings();
    toastr.success('编辑配置已保存');
},

        saveSettingsTab() {
            const s = this.getSettings();

            s.roundTriggerWords = String($('#fgr-set-round-trigger').val() || '');
            s.flightStartKeywords = String($('#fgr-set-flight-start').val() || '');
            s.flightReplayKeywords = String($('#fgr-set-flight-replay').val() || '');
            s.kingStartKeywords = String($('#fgr-set-king-start').val() || '');

            s.diceCountMode = this.normalizeDiceMode($('#fgr-set-dice-count-mode').val());

            {
                const fixed = Math.trunc(Number($('#fgr-set-dice-fixed-count').val()));
                s.diceFixedCount = Number.isFinite(fixed) ? Math.min(2, Math.max(1, fixed)) : 1;
            }

            {
                const threshold = Math.trunc(
                    Number($('#fgr-set-dice-auto-switch-player-count').val())
                );
                s.diceAutoSwitchPlayerCount = Number.isFinite(threshold)
                    ? Math.max(2, threshold)
                    : 6;
            }

            s.fairnessMode = String($('#fgr-set-fairness-mode').val() || 'strict');

            if (!this.validateMapInTab()) return;
            s.flightMapJson = String($('#fgr-set-flight-map-json').val() || '');

            let parsedMap = null;
            try {
                parsedMap = JSON.parse(s.flightMapJson);
            } catch (_e) {
                parsedMap = null;
            }
            if (!parsedMap || typeof parsedMap !== 'object') {
                return toastr.error('地图JSON解析失败');
            }

            const safeMap = this.getSafeMapFromRaw(parsedMap);
            if (!safeMap) {
                return toastr.error('地图结构无效，无法保存到可选地图');
            }

            s.flightMapJson = JSON.stringify(safeMap, null, 2);
            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            const lib = this.getMapLibrary(s);

            const currentName =
                String($('#fgr-map-select').val() || '').trim() ||
                String(lib.active || '').trim() ||
                '新地图';

            const inputName = window.prompt(
                '请输入新地图名称（将新增，不覆盖）：',
                currentName + '-副本'
            );
            if (inputName === null) {
                this.saveSettings();
                return toastr.info('已保存设置，但未新增到可选地图（你取消了命名）');
            }

            const baseName = String(inputName || '').trim();
            if (!baseName) {
                return toastr.warning('地图名称不能为空');
            }

            const used = new Set(lib.items.map((i) => i.name));
            const finalName = this.dedupeName(baseName, used);

            lib.items.push({ name: finalName, map: safeMap });
            lib.active = finalName;

            this.setMapLibrary(s, lib);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(safeMap);

            this.saveSettings();
            toastr.success(`设置已保存，并新增地图：${finalName}`);
        },
        async handleUndoRound() {
            if (!globalThis.FGR_ACTIONS?.undoRound) {
                toastr.error('缺少 undoRound 动作');
                return;
            }

            const res = await globalThis.FGR_ACTIONS.undoRound();
            if (!res?.ok) {
                toastr.warning(res?.error || '没有可回退的上一回合');
                return;
            }

            toastr.success(`已回退到第${res.round}回合`);
            if ($('#fgr-tab-map').hasClass('active')) this.renderBoardCanvas();
            if ($('#fgr-tab-card').hasClass('active')) {
                await this.renderCardDrawTab({ autoShuffle: false });
            }
        },

        async handleRedoRound() {
            if (!globalThis.FGR_ACTIONS?.redoRound) {
                toastr.error('缺少 redoRound 动作');
                return;
            }

            const res = await globalThis.FGR_ACTIONS.redoRound();
            if (!res?.ok) {
                toastr.warning(res?.error || '没有可前进的下一回合');
                return;
            }

            toastr.success(`已前进到第${res.round}回合`);
            if ($('#fgr-tab-map').hasClass('active')) this.renderBoardCanvas();
            if ($('#fgr-tab-card').hasClass('active')) {
                await this.renderCardDrawTab({ autoShuffle: false });
            }
        },

        async handleKingResetProgress() {
            if (!globalThis.FGR_ACTIONS?.resetKingProgress) {
                toastr.error('缺少 resetKingProgress 动作');
                return;
            }

            const ok = window.confirm('确定重置国王游戏回合进度吗？会清空当前国王回合包与回合数。');
            if (!ok) return;

            const res = await globalThis.FGR_ACTIONS.resetKingProgress();
            if (!res?.ok) {
                toastr.error(res?.error || '重置失败');
                return;
            }

            toastr.success('国王回合进度已重置');
            await this.renderCardDrawTab({ autoShuffle: true, forceRebuild: true });
        },
    };

    globalThis.FGR_UI = UI;
})();
