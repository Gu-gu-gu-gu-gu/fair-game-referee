(() => {
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

        normalizeDiceMode(raw) {
            const x = String(raw || '').trim().toLowerCase();
            if (['fixed', '固定', '固定模式', 'manual'].includes(x)) return 'fixed';
            return 'auto';
        },

        getCurrentCharacterName() {
            const c = SillyTavern.getContext();
            const chid = c.characterId;
            if (typeof chid !== 'number' || chid < 0) return '';
            return String(c.characters?.[chid]?.name || '').trim();
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
            Object.keys(lib).sort((a, b) => a.localeCompare(b)).forEach(name => {
                const $opt = $('<option></option>');
                $opt.val(name);
                $opt.text(name);
                $sel.append($opt);
            });

            $sel.val(active);
            $('#fgr-edit-manual-players').val(String(lib[active] || ''));

            if (ensured.changed) this.saveSettings();
        },

        refreshPlayerProfileUI() {
            this.renderPlayerProfileSelect();
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

            $('#fgr-edit-manual-players').val(String(lib[name] || ''));
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
            const nextName = Object.keys(lib)[0];
            s.activePlayerProfileName = nextName;
            this.setPlayerProfileLibrary(s, lib);
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

            this.ensureControlModal();
            this.ensureCellEditorModal();
            $(window).on('resize.fgrBoard', () => this.renderBoardCanvas());
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

        <div class="settings_section fgr-map-toolbar">
          <button id="fgr-map-render" class="menu_button fgr-icon-btn" type="button" title="重绘棋盘" aria-label="重绘棋盘">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.25144 4 6.82508 5.38626 5.38443 7.5H8V9.5H2V3.5H4V5.99936C5.82381 3.57166 8.72764 2 12 2C17.5228 2 22 6.47715 22 12H20C20 7.58172 16.4183 4 12 4ZM4 12C4 16.4183 7.58172 20 12 20C14.7486 20 17.1749 18.6137 18.6156 16.5H16V14.5H22V20.5H20V18.0006C18.1762 20.4283 15.2724 22 12 22C6.47715 22 2 17.5228 2 12H4Z"></path></svg>
          </button>

          <button id="fgr-map-reset-progress" class="menu_button fgr-icon-btn" type="button" title="重置本聊天棋子进度" aria-label="重置本聊天棋子进度">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>

          <button id="fgr-round-undo" class="menu_button fgr-icon-btn" type="button" title="回退上一轮" aria-label="回退上一轮">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7.82843 11H20V13H7.82843L13.1924 18.364L11.7782 19.7782L4 12L11.7782 4.22183L13.1924 5.63604L7.82843 11Z"></path></svg>
          </button>

          <button id="fgr-round-redo" class="menu_button fgr-icon-btn" type="button" title="前进下一轮" aria-label="前进下一轮">
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

        <div class="settings_section"><label>手动玩家名单</label><textarea id="fgr-edit-manual-players" class="text_pole" rows="3"></textarea></div>
        <div class="settings_section"><label>User别名</label><input id="fgr-edit-user-aliases" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>User统一名</label><input id="fgr-edit-user-canonical-name" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>黑名单</label><input id="fgr-edit-name-blacklist" class="text_pole" type="text" /></div>
      </div>

      <div id="fgr-tab-settings" class="fgr-tab">
        <div class="settings_section"><label>下一轮触发词</label><input id="fgr-set-round-trigger" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>飞行棋启动词</label><input id="fgr-set-flight-start" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>飞行棋重开词</label><input id="fgr-set-flight-replay" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>骰子启动词</label><input id="fgr-set-dice-start" class="text_pole" type="text" /></div>
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
        <div class="settings_section"><label>国王游戏启动词</label><input id="fgr-set-king-start" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>真心话大冒险启动词</label><input id="fgr-set-truth-start" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>俄罗斯转盘启动词</label><input id="fgr-set-roulette-start" class="text_pole" type="text" /></div>

        <div class="settings_section">
          <label>结果模式</label>
          <select id="fgr-set-fairness-mode" class="text_pole">
            <option value="strict">严格公平</option>
            <option value="director">导演模式</option>
            <option value="display_only">仅展示</option>
          </select>
        </div>

        <hr class="sysHR" />
        <div class="settings_section flex-container alignItemsCenter">
          <input type="checkbox" id="fgr-set-classifier-enabled" />
          <label for="fgr-set-classifier-enabled" style="margin-bottom:0;">启用外部LLM判定</label>
        </div>

        <div class="settings_section">
          <label>判定接口类型</label>
          <select id="fgr-set-classifier-provider" class="text_pole">
            <option value="none">关闭</option>
            <option value="openai_compat">OpenAI兼容接口</option>
            <option value="google_ai_studio">Google AI Studio</option>
          </select>
        </div>

        <div class="settings_section"><label>OpenAI兼容 Endpoint</label><input id="fgr-set-openai-endpoint" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>API Key（明文本地保存）</label><input id="fgr-set-classifier-apikey" class="text_pole" type="password" /></div>

        <div class="settings_section fgr-map-toolbar">
          <button id="fgr-set-connect-models" class="menu_button" type="button">连接并拉取模型列表</button>
        </div>

        <div class="settings_section">
          <label>可选模型</label>
          <select id="fgr-set-model-select" class="text_pole"></select>
        </div>

        <div class="settings_section"><label>OpenAI兼容 Model</label><input id="fgr-set-openai-model" class="text_pole" type="text" /></div>
        <div class="settings_section"><label>Google Model</label><input id="fgr-set-google-model" class="text_pole" type="text" /></div>

        <div class="settings_section flex-container alignItemsCenter">
          <input type="checkbox" id="fgr-set-classifier-every-msg" />
          <label for="fgr-set-classifier-every-msg" style="margin-bottom:0;">每条用户消息都调用判定API</label>
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

            $('#fgr-modal-close').on('click', () => this.close());
            $('#fgr-control-modal').on('click', (e) => {
                if (e.target && e.target.id === 'fgr-control-modal') this.close();
            });
            $(document).on('keydown.fgrModal', (e) => {
                if (e.key === 'Escape') this.close();
            });

            $('.fgr-icon-btn[data-tab]').on('click', (e) => this.switchTab($(e.currentTarget).data('tab')));

            $('#fgr-map-add-row').on('click', () => this.addMapRow());
            $('#fgr-map-save').on('click', () => this.saveMapFromVisual());
            $('#fgr-map-render').on('click', () => this.renderBoardCanvas());
            $('#fgr-map-reset-progress').on('click', () => this.resetFlightProgress());

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
            $('#fgr-map-rows').on('input', '.fgr-at, .fgr-move, .fgr-text', () => this.renderBoardCanvas());
            $('#fgr-board-canvas').on('click', (e) => this.onCanvasClick(e));

            $('#fgr-set-dice-count-mode, #fgr-set-dice-fixed-count, #fgr-set-dice-auto-switch-player-count')
                .on('change input', () => this.quickSaveDiceSettings());

            $('#fgr-edit-save').on('click', async () => {
                await this.saveEditTab();
            });
            $('#fgr-edit-profile-select').on('change', () => this.onProfileSelectChange());
            $('#fgr-edit-profile-create').on('click', () => this.createProfile());
            $('#fgr-edit-profile-rename').on('click', () => this.renameProfile());
            $('#fgr-edit-profile-delete').on('click', () => this.deleteProfile());
            $('#fgr-edit-profile-use-char').on('click', () => this.useCurrentCharacterProfile());
            $('#fgr-set-save').on('click', () => this.saveSettingsTab());
            $('#fgr-set-validate-map').on('click', () => this.validateMapInTab());

            $('#fgr-set-connect-models').on('click', () => this.connectAndFetchModels());
            $('#fgr-set-model-select').on('change', (e) => {
                const vRaw = String($(e.target).val() || '').trim();
                if (!vRaw) return;
                const provider = String($('#fgr-set-classifier-provider').val() || 'none');

                if (provider === 'openai_compat') {
                    $('#fgr-set-openai-model').val(vRaw);
                } else if (provider === 'google_ai_studio') {
                    const normalized = vRaw.replace(/^models\//, '');
                    $('#fgr-set-google-model').val(normalized);
                }
            });
        },

        ensureCellEditorModal() {
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
        },

        normalizeDiceFaces(input) {
            let arr = [];
            if (Array.isArray(input)) arr = input;
            else if (Number.isFinite(Number(input))) arr = [Number(input)];

            arr = arr
                .map(x => Math.min(6, Math.max(1, Math.trunc(Number(x) || 1))))
                .slice(0, 2);

            if (!arr.length) arr = [1];
            return arr;
        },

        setCupDieFace($el, n) {
            const v = Math.min(6, Math.max(1, Math.trunc(Number(n) || 1)));
            $el.removeClass('face-1 face-2 face-3 face-4 face-5 face-6').addClass('face-' + v);
        },

        setBoardDiceFaces(values) {
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
        },

        openCellEditorModal(pos) {
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
        },

        closeCellEditorModal() {
            $('#fgr-cell-editor-modal').hide();
            this.editingPos = null;
        },

        saveCellEditorModal() {
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
        },

        deleteCellEditorModal() {
            const pos = Math.trunc(Number(this.editingPos));
            if (!Number.isFinite(pos) || pos <= 0) return;

            this.removeRowByAt(pos);
            this.closeCellEditorModal();
            this.renderBoardCanvas();
            toastr.info(`已删除第 ${pos} 格事件`);
        },

        quickSaveDiceSettings() {
            const s = this.getSettings();
            s.diceCountMode = this.normalizeDiceMode($('#fgr-set-dice-count-mode').val());

            {
                const fixed = Math.trunc(Number($('#fgr-set-dice-fixed-count').val()));
                s.diceFixedCount = Number.isFinite(fixed) ? Math.min(2, Math.max(1, fixed)) : 1;
            }

            {
                const threshold = Math.trunc(Number($('#fgr-set-dice-auto-switch-player-count').val()));
                s.diceAutoSwitchPlayerCount = Number.isFinite(threshold) ? Math.max(2, threshold) : 6;
            }

            this.saveSettings();
        },

        quickSaveAnimSpeed() {
            const s = this.getSettings();
            const ms = Math.trunc(Number($('#fgr-map-anim-speed').val()));
            s.clickAnimationMs = Number.isFinite(ms) ? Math.min(6000, Math.max(800, ms)) : 2200;
            this.saveSettings();
        },

        ensureRollAudio() {
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
        },

        playRollSound(durationMs) {
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
        },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        setRollBtnLocked(locked) {
            const $dice = $('#fgr-board-dice');
            if (!$dice.length) return;
            $dice.toggleClass('locked', !!locked);
            $dice.attr('title', locked ? '摇骰中...' : '点击摇骰');
            $dice.attr('aria-disabled', locked ? 'true' : 'false');
        },

        async playDiceAnimation(finalValues, durationMs) {
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
        },

                async playMoveAnimation(anim, durationMs) {
            const before = Object.assign({}, anim?.beforePositions || {});
            const after = Object.assign({}, anim?.afterPositions || {});
            const order = Array.isArray(anim?.turnOrder) ? anim.turnOrder : Object.keys(after);

            const collisionVictims = new Set(
                Array.isArray(anim?.collisionVictims)
                    ? anim.collisionVictims.map(x => String(x || '').trim()).filter(Boolean)
                    : []
            );

            const names = Array.from(new Set([
                ...order,
                ...Object.keys(before),
                ...Object.keys(after),
            ]));

            this.animPositions = {};
            for (const name of names) {
                const b = Math.trunc(Number(before[name]));
                const a = Math.trunc(Number(after[name]));
                if (Number.isFinite(b)) this.animPositions[name] = b;
                else if (Number.isFinite(a)) this.animPositions[name] = a;
            }
            this.renderBoardCanvas();

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
        },

        async handleRollClick() {
            if (this.rollAnimating) return;

            const s = this.getSettings();
            const state = this.getChatState ? this.getChatState() : null;
            if (!state) return toastr.error('无法读取聊天状态');

            let resetMap = false;
            const winners = state?.lastResult?.result?.winners;
            if (Array.isArray(winners) && winners.length > 0) {
                const ans = window.prompt('上轮已有人到终点：输入 1=下一轮，2=重开', '1');
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

                toastr.success(`飞行棋第${ret.packet.round}轮已裁定`);
            } catch (err) {
                console.error('[fair-game-referee] 点击摇骰子失败', err);
                toastr.error('摇骰子失败：' + (err?.message || err));
            } finally {
                this.rollAnimating = false;
                this.setRollBtnLocked(false);
            }
        },

        async handleUndoRound() {
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
                toastr.success(`已回退到第${ret.round}轮`);
            } catch (err) {
                console.error('[fair-game-referee] 回退失败', err);
                toastr.error('回退失败：' + (err?.message || err));
            }
        },

        async handleRedoRound() {
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
                toastr.success(`已前进到第${ret.round}轮`);
            } catch (err) {
                console.error('[fair-game-referee] 前进失败', err);
                toastr.error('前进失败：' + (err?.message || err));
            }
        },

        switchTab(tab) {
            $('.fgr-icon-btn[data-tab]').removeClass('active');
            $('.fgr-icon-btn[data-tab="' + tab + '"]').addClass('active');
            $('.fgr-tab').removeClass('active');
            $('#fgr-tab-' + tab).addClass('active');
            if (tab === 'map') this.renderBoardCanvas();
        },

        dedupeName(name, usedSet) {
            const base = String(name || '未命名地图').trim() || '未命名地图';
            let n = base;
            let i = 2;
            while (usedSet.has(n)) {
                n = base + '(' + i + ')';
                i++;
            }
            return n;
        },

        getSafeMapFromRaw(raw) {
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
        },

        getMapLibrary(settings) {
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
        },

        setMapLibrary(settings, lib) {
            settings.mapLibraryJson = JSON.stringify(lib, null, 2);
        },

        findMapByName(lib, name) {
            return lib.items.find(i => i.name === name) || null;
        },

        renderMapSelector(settings, lib) {
            const $sel = $('#fgr-map-select');
            $sel.empty();
            for (const item of lib.items) {
                const $opt = $('<option></option>');
                $opt.val(item.name);
                $opt.text(item.name);
                $sel.append($opt);
            }
            $sel.val(lib.active);
        },

        switchActiveMap(name, silent) {
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
        },

        addMapRow(data, silent) {
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
        },

        loadMapToEditor(map) {
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
        },

        getVisualMapData() {
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
        },

        renderModelOptions(list) {
            const $sel = $('#fgr-set-model-select');
            if (!$sel.length) return;
            $sel.empty();
            $sel.append($('<option></option>').val('').text('（请选择模型）'));
            (list || []).forEach(m => {
                const v = String(m || '').trim();
                if (!v) return;
                $sel.append($('<option></option>').val(v).text(v));
            });
        },

        normalizeOpenAIModelsUrl(endpoint) {
            let e = String(endpoint || '').trim();
            if (!e) return '';
            e = e.replace(/\/+$/, '');
            if (e.endsWith('/chat/completions')) return e.replace(/\/chat\/completions$/, '/models');
            if (e.endsWith('/v1')) return e + '/models';
            if (e.endsWith('/models')) return e;
            return e + '/models';
        },

        async connectAndFetchModels() {
            const provider = String($('#fgr-set-classifier-provider').val() || 'none');
            const apiKey = String($('#fgr-set-classifier-apikey').val() || '').trim();

            try {
                let models = [];

                if (provider === 'openai_compat') {
                    const endpoint = String($('#fgr-set-openai-endpoint').val() || '').trim();
                    const modelsUrl = this.normalizeOpenAIModelsUrl(endpoint);
                    if (!modelsUrl) return toastr.warning('请先填写 OpenAI Endpoint');

                    const resp = await fetch(modelsUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                        },
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const data = await resp.json();
                    models = Array.isArray(data?.data) ? data.data.map(x => x?.id).filter(Boolean) : [];
                } else if (provider === 'google_ai_studio') {
                    if (!apiKey) return toastr.warning('Google AI Studio 需要 API Key');
                    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
                    const resp = await fetch(url);
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const data = await resp.json();
                    const raw = Array.isArray(data?.models) ? data.models.map(x => x?.name).filter(Boolean) : [];
                    models = raw.map(x => String(x).replace(/^models\//, ''));
                } else {
                    return toastr.warning('请先选择判定接口类型');
                }

                if (!models.length) return toastr.warning('连接成功，但未拿到模型列表（可能接口未开放 models 或被 CORS 限制）');

                const s = this.getSettings();
                s.classifierModelListJson = JSON.stringify(models);
                this.saveSettings();

                this.renderModelOptions(models);
                toastr.success(`已获取 ${models.length} 个模型`);
            } catch (err) {
                console.error('[fair-game-referee] 获取模型失败', err);
                toastr.error('获取模型失败：' + (err?.message || err));
            }
        },

        loadFromSettings() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);

            const activeItem = this.findMapByName(lib, lib.active) || lib.items[0];
            s.flightMapJson = JSON.stringify(activeItem.map, null, 2);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(activeItem.map);

            this.renderPlayerProfileSelect();

            $('#fgr-edit-user-aliases').val(s.userAliases);
            $('#fgr-edit-user-canonical-name').val(s.userCanonicalName);
            $('#fgr-edit-name-blacklist').val(s.nameBlacklist);

            $('#fgr-set-round-trigger').val(s.roundTriggerWords);
            $('#fgr-set-flight-start').val(s.flightStartKeywords);
            $('#fgr-set-flight-replay').val(s.flightReplayKeywords);
            $('#fgr-set-dice-start').val(s.diceStartKeywords);

            const diceMode = this.normalizeDiceMode(s.diceCountMode || 'auto');
            $('#fgr-set-dice-count-mode').val(diceMode);
            $('#fgr-set-dice-fixed-count').val(Number.isFinite(Number(s.diceFixedCount)) ? Math.min(2, Math.max(1, Number(s.diceFixedCount))) : 1);
            $('#fgr-set-dice-auto-switch-player-count').val(Number.isFinite(Number(s.diceAutoSwitchPlayerCount)) ? Math.max(2, Number(s.diceAutoSwitchPlayerCount)) : 6);

            $('#fgr-map-anim-speed').val(String(Number(s.clickAnimationMs) || 2200));
            $('#fgr-set-king-start').val(s.kingStartKeywords);
            $('#fgr-set-truth-start').val(s.truthDareStartKeywords);
            $('#fgr-set-roulette-start').val(s.rouletteStartKeywords);

            $('#fgr-set-fairness-mode').val(s.fairnessMode);

            $('#fgr-set-classifier-enabled').prop('checked', !!s.classifierEnabled);
            $('#fgr-set-classifier-provider').val(s.classifierProvider || 'none');
            $('#fgr-set-openai-endpoint').val(s.openaiEndpoint || '');
            $('#fgr-set-classifier-apikey').val(s.classifierApiKey || '');
            $('#fgr-set-openai-model').val(s.openaiModel || '');
            $('#fgr-set-google-model').val(s.googleModel || '');
            $('#fgr-set-classifier-every-msg').prop('checked', !!s.classifierEveryMsg);

            let modelList = [];
            try { modelList = JSON.parse(String(s.classifierModelListJson || '[]')); } catch (_e) {}
            this.renderModelOptions(Array.isArray(modelList) ? modelList : []);

            $('#fgr-set-flight-map-json').val(s.flightMapJson);

            this.setMapLibrary(s, lib);
            this.saveSettings();
        },

        open(tab) {
            const targetTab = tab || 'map';
            try {
                this.loadFromSettings();
                this.switchTab(targetTab);
                $('#fgr-control-modal').css('display', 'flex');
            } catch (err) {
                console.error('[fair-game-referee] 打开面板失败', err);
                toastr.error('打开面板失败：' + (err && err.message ? err.message : err));
            }
        },

        close() {
            $('#fgr-control-modal').hide();
        },

        saveMapFromVisual() {
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
        },

        renameSelectedMap() {
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
        },

        deleteSelectedMap() {
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
        },

        safeFilename(str) {
            return String(str || 'map').replace(/[\\/:*?"<>|]/g, '_').trim() || 'map';
        },

        downloadJson(filename, obj) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },

        exportSelectedMap() {
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
        },

        exportAllMapsPack() {
            const s = this.getSettings();
            const lib = this.getMapLibrary(s);
            this.downloadJson('fgr-map-pack.json', {
                fgrMapPack: true,
                version: 1,
                active: lib.active,
                maps: lib.items
            });
            toastr.success('已导出全部地图包');
        },

        exportByChoice() {
            const ans = window.prompt('导出类型：输入 1=选中地图，2=全部地图包', '1');
            if (ans === null) return;
            const x = String(ans).trim();
            if (x === '2') this.exportAllMapsPack();
            else this.exportSelectedMap();
        },

        async importMapFile(e) {
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
        },

        getPosCellInfo(pos, cols, rowsTotal) {
            const idx = pos - 1;
            const rowFromBottom = Math.floor(idx / cols);
            const offset = idx % cols;
            const col = (rowFromBottom % 2 === 0) ? offset : (cols - 1 - offset);
            const rowTop = rowsTotal - 1 - rowFromBottom;
            return { col, rowTop };
        },

        getEventsMap(events) {
            const map = new Map();
            for (const e of (events || [])) {
                const at = Number(e.at);
                if (Number.isFinite(at)) map.set(at, e);
            }
            return map;
        },

        getPiecesByPos(win) {
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
        },

        colorByName(name) {
            const palette = ['#ff6fa8', '#6fc2ff', '#ffd36f', '#8affb2', '#c59bff', '#ff9f6f'];
            let h = 0;
            const s = String(name || '');
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return palette[h % palette.length];
        },

        renderPieceList(positionsObj) {
            const entries = Object.entries(positionsObj || {})
                .map(([name, p]) => [name, Number(p)])
                .filter(([, p]) => Number.isFinite(p))
                .sort((a, b) => b[1] - a[1]);

            const $list = $('#fgr-piece-list');
            if (!$list.length) return;
            if (!entries.length) {
                $list.text('当前聊天暂无棋子位置数据（先跑一轮飞行棋即可显示）');
                return;
            }

            $list.html(entries.map(([name, p]) => `<span>${name}: <b>${Math.trunc(p)}</b>格</span>`).join(' ｜ '));
        },

        roundRect(ctx, x, y, w, h, r, fill, stroke) {
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
        },

        clipText(t, n) {
            const s = String(t || '');
            return s.length <= n ? s : (s.slice(0, n) + '…');
        },

        renderBoardCanvas() {
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

            const rowsTotal = Math.max(1, Math.ceil(win / cols));
            const cellW = Math.floor(cssWidth / cols);
            const cellH = cellW < 58 ? 62 : 52;

            const cssHeight = rowsTotal * cellH;

            canvas.style.height = cssHeight + 'px';
            canvas.width = Math.floor(cssWidth * dpr);
            canvas.height = Math.floor(cssHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssWidth, cssHeight);

            this.cellRects = [];
            const eventsMap = this.getEventsMap(map.events);

            const cupRowTop = Math.floor((rowsTotal - 1) / 2);
            const cupCol = 2;
            let cupPos = null;

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
                const info = this.getPosCellInfo(p, cols, rowsTotal);
                const x = info.col * cellW + cellW / 2;
                const y = info.rowTop * cellH + cellH / 2;
                if (p === 1) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            for (let p = 1; p <= win; p++) {
                const info = this.getPosCellInfo(p, cols, rowsTotal);
                const x = info.col * cellW + 4;
                const y = info.rowTop * cellH + 4;
                const w = cellW - 8;
                const h = cellH - 8;

                const hasEvent = eventsMap.has(p);
                const isCupCell = (info.rowTop === cupRowTop && info.col === cupCol);
                if (isCupCell) cupPos = p;

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

                const isStart = p === 1;
                const isEnd = p === win;
                const isSelected = this.selectedPos === p;

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

                if (!isCupCell) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText('#' + p, x + 8, y + 18);

                    if (hasEvent) {
                        const ev = eventsMap.get(p);
                        const move = Number(ev.move || 0);
                        const moveText = (move >= 0 ? '+' : '') + move;

                        ctx.fillStyle = '#ffd37e';
                        ctx.font = '12px sans-serif';
                        ctx.fillText(moveText, x + 8, y + 36);
                    }

                    const victims = collisionVictimsByPos.get(p) || [];
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
                }

                this.cellRects.push({ pos: p, x, y, w, h, col: info.col, rowTop: info.rowTop });
            }

            this.cupPos = cupPos;
            this.placeBoardDice(rowsTotal);

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
        },

        renderBoardCanvas() {
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

            // 预留1个“骰盅专用空位”
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

            // 生成“蛇形路径”，但跳过骰盅空位
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

            // 路径线
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

            // 画所有格子（含骰盅空位）
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
        },

        placeBoardDice(rowsTotal, fixedCenter) {
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
        },

        onCanvasClick(evt) {
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
        },

        findRowByAt(pos) {
            let found = null;
            $('#fgr-map-rows .fgr-map-row').each((_, el) => {
                const at = Number($(el).find('.fgr-at').val());
                if (Number.isFinite(at) && at === pos) {
                    found = $(el);
                    return false;
                }
            });
            return found;
        },

        upsertRow(at, move, text) {
            const row = this.findRowByAt(at);
            if (row) {
                row.find('.fgr-move').val(move);
                row.find('.fgr-text').val(text);
                return;
            }
            this.addMapRow({ at, move, text }, true);
        },

        removeRowByAt(at) {
            const row = this.findRowByAt(at);
            if (row) row.remove();
        },

        editEventByPos(pos) {
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
        },

                async resetFlightProgress() {
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
        },

        validateMapInTab() {
            const raw = String($('#fgr-set-flight-map-json').val() || '');
            const checked = this.validateFlightMapJson(raw);
            if (!checked.ok) return toastr.error('[飞行棋JSON] ' + checked.error);
            $('#fgr-set-flight-map-json').val(JSON.stringify(checked.map, null, 2));
            toastr.success('JSON校验通过');
            return true;
        },

                async saveEditTab() {
            const s = this.getSettings();
            const lib = this.getPlayerProfileLibrary(s);

            let activeName = String($('#fgr-edit-profile-select').val() || s.activePlayerProfileName || '').trim();
            if (!activeName) activeName = '默认名单';

            if (!Object.hasOwn(lib, activeName)) {
                lib[activeName] = '';
            }

            lib[activeName] = String($('#fgr-edit-manual-players').val() || '');
            s.activePlayerProfileName = activeName;
            this.setPlayerProfileLibrary(s, lib);

            // 兼容旧字段：保留一份当前激活名单到 manualPlayers（可选）
            s.manualPlayers = lib[activeName];

            s.userAliases = String($('#fgr-edit-user-aliases').val() || '');
            s.userCanonicalName = String($('#fgr-edit-user-canonical-name').val() || 'user').trim() || 'user';
            s.nameBlacklist = String($('#fgr-edit-name-blacklist').val() || '');

            this.saveSettings();
            this.renderPlayerProfileSelect();
            toastr.success('编辑配置已保存（已保存到当前玩家名单）');
        },

        saveSettingsTab() {
            const s = this.getSettings();

            s.roundTriggerWords = String($('#fgr-set-round-trigger').val() || '');
            s.flightStartKeywords = String($('#fgr-set-flight-start').val() || '');
            s.flightReplayKeywords = String($('#fgr-set-flight-replay').val() || '');
            s.diceStartKeywords = String($('#fgr-set-dice-start').val() || '');

            s.diceCountMode = this.normalizeDiceMode($('#fgr-set-dice-count-mode').val());

            {
                const fixed = Math.trunc(Number($('#fgr-set-dice-fixed-count').val()));
                s.diceFixedCount = Number.isFinite(fixed) ? Math.min(2, Math.max(1, fixed)) : 1;
            }

            {
                const threshold = Math.trunc(Number($('#fgr-set-dice-auto-switch-player-count').val()));
                s.diceAutoSwitchPlayerCount = Number.isFinite(threshold) ? Math.max(2, threshold) : 6;
            }

            s.kingStartKeywords = String($('#fgr-set-king-start').val() || '');
            s.truthDareStartKeywords = String($('#fgr-set-truth-start').val() || '');
            s.rouletteStartKeywords = String($('#fgr-set-roulette-start').val() || '');

            s.fairnessMode = String($('#fgr-set-fairness-mode').val() || 'strict');

            s.classifierEnabled = !!$('#fgr-set-classifier-enabled').prop('checked');
            s.classifierProvider = String($('#fgr-set-classifier-provider').val() || 'none');
            s.openaiEndpoint = String($('#fgr-set-openai-endpoint').val() || '').trim();
            s.classifierApiKey = String($('#fgr-set-classifier-apikey').val() || '').trim();
            s.openaiModel = String($('#fgr-set-openai-model').val() || '').trim();
            s.googleModel = String($('#fgr-set-google-model').val() || '').trim();
            s.classifierEveryMsg = !!$('#fgr-set-classifier-every-msg').prop('checked');

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

            const currentName = String($('#fgr-map-select').val() || '').trim()
                || String(lib.active || '').trim()
                || '新地图';

            const inputName = window.prompt('请输入新地图名称（将新增，不覆盖）：', currentName + '-副本');
            if (inputName === null) {
                this.saveSettings();
                return toastr.info('已保存设置，但未新增到可选地图（你取消了命名）');
            }

            const baseName = String(inputName || '').trim();
            if (!baseName) {
                return toastr.warning('地图名称不能为空');
            }

            const used = new Set(lib.items.map(i => i.name));
            const finalName = this.dedupeName(baseName, used);

            lib.items.push({ name: finalName, map: safeMap });
            lib.active = finalName;

            this.setMapLibrary(s, lib);

            this.renderMapSelector(s, lib);
            this.loadMapToEditor(safeMap);

            this.saveSettings();
            toastr.success(`设置已保存，并新增地图：${finalName}`);
        }
    };

    globalThis.FGR_UI = UI;
})();
