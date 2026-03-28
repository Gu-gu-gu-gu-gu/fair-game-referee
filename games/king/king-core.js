(() => {
  // 普通牌面顺序（用于排序和生成牌堆）
  const RANKS = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];

  function shuffle(list, roll) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j =
        typeof roll === "function"
          ? roll(0, i)
          : Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function rankIndex(card) {
    const idx = RANKS.indexOf(card);
    return idx === -1 ? 999 : idx;
  }

  /**
   * 校验导演传进来的 assignments 是否合法：
   * - 数量 = players.length
   * - 玩家集合完全一致
   * - 牌集合 = ["王", A,2,3,...] 截断到 N 张
   * - 恰好有 1 张 "王"
   */
  function validateAssignmentsOverride(players, assignments) {
    if (!Array.isArray(assignments) || !assignments.length) return null;
    if (!Array.isArray(players) || players.length < 2) return null;
    if (assignments.length !== players.length) return null;

    const playerSet = new Set(players);
    const seenPlayers = new Set();
    const cards = [];

    for (const a of assignments) {
      if (!a || typeof a.player !== "string" || typeof a.card !== "string")
        return null;
      const p = a.player.trim();
      if (!playerSet.has(p)) return null;
      if (seenPlayers.has(p)) return null;
      seenPlayers.add(p);
      cards.push(a.card.trim());
    }

    if (seenPlayers.size !== playerSet.size) return null;

    const n = players.length;
    const ranks = RANKS.slice(0, Math.max(1, n - 1));
    const expectedDeck = ["王", ...ranks].slice(0, n).sort();
    const gotDeck = cards.slice().sort();

    if (expectedDeck.length !== gotDeck.length) return null;
    for (let i = 0; i < expectedDeck.length; i++) {
      if (expectedDeck[i] !== gotDeck[i]) return null;
    }
    if (cards.filter((c) => c === "王").length !== 1) return null;

    return assignments.map((a) => ({
      player: a.player.trim(),
      card: a.card.trim(),
    }));
  }

  function runKingRound(options = {}) {
    const players = Array.isArray(options.players)
      ? options.players.slice()
      : [];
    const state = options.state || {};
    const settings = options.settings || {};
    const roll =
      typeof options.roll === "function"
        ? options.roll
        : (min, max) =>
            Math.floor(Math.random() * (max - min + 1)) + min;

    if (players.length < 2) {
      return {
        rows: [],
        summary: "国王游戏至少需要2名玩家",
        cellTexts: [],
        turnOrder: [],
        collisionTexts: [],
        collisionMarks: [],
        winners: [],
        king: null,
      };
    }

    const n = players.length;

    // 1）如果导演模式传了完整 assignmentsOverride，优先使用
    const override = validateAssignmentsOverride(
      players,
      options.assignmentsOverride
    );

    let assignments;
    if (override) {
      assignments = override;
    } else {
      // 2）否则走普通随机逻辑，但检查是否有“预设 user 牌”
      const ranks = RANKS.slice(0, Math.max(1, n - 1));
      const baseDeck = ["王", ...ranks].slice(0, n);

      const userName = String(
        settings.userCanonicalName || "user"
      ).trim();
      const presetCard =
        state.king && typeof state.king.presetUserCard === "string"
          ? state.king.presetUserCard.trim()
          : "";

      // 如果没有预设牌 或 user 不在玩家列表，就全随机
      const userIndex = players.indexOf(userName);
      const canUsePreset =
        presetCard &&
        userIndex !== -1 &&
        baseDeck.includes(presetCard);

      if (!canUsePreset) {
        const shuffledPlayers = shuffle(players, roll);
        const shuffledDeck = shuffle(baseDeck, roll);
        assignments = shuffledPlayers.map((p, i) => ({
          player: p,
          card: shuffledDeck[i],
        }));
      } else {
        // 有预设牌：先给 user 指定牌，其余随机
        const deck = baseDeck.slice();
        const idxCard = deck.indexOf(presetCard);
        deck.splice(idxCard, 1); // 去掉已分配给 user 的牌

        const others = players.filter((p) => p !== userName);
        const shuffledOthers = shuffle(others, roll);
        const shuffledDeck = shuffle(deck, roll);

        assignments = [];
        assignments.push({ player: userName, card: presetCard });
        for (let i = 0; i < shuffledOthers.length; i++) {
          assignments.push({
            player: shuffledOthers[i],
            card: shuffledDeck[i],
          });
        }

        // 用完一次就清空预设
        state.king = state.king || {};
        state.king.presetUserCard = null;
      }
    }

    // 找出国王（抽到“王”的玩家）
    let kingAssign = assignments.find((a) => a.card === "王") || null;
    if (!kingAssign) {
      // 防御：理论不应发生，但出问题就强制把第一个改成王
      kingAssign = assignments[0];
      kingAssign.card = "王";
    }
    const kingPlayer = kingAssign.player;

    // 计算非国王玩家的编号（1号=A，2号=2，3号=3…）
    const nonKings = assignments.filter((a) => a.player !== kingPlayer);
    const numberedNonKings = nonKings
      .slice()
      .sort((a, b) => rankIndex(a.card) - rankIndex(b.card))
      .map((a, idx) => ({
        player: a.player,
        card: a.card,
        number: idx + 1,
      }));

    const numberByPlayer = new Map(
      numberedNonKings.map((x) => [x.player, x.number])
    );

    const rows = assignments.map((a) => {
      const num = numberByPlayer.get(a.player);
      if (a.card === "王") {
        return { player: a.player, value: "王（国王牌）" };
      }
      const numText = num ? `${num}号` : "未编号";
      return { player: a.player, value: `${a.card} → ${numText}` };
    });

    // 存档
    state.king = state.king || {};
    state.king.lastAssignments = assignments;
    state.king.lastNumbered = numberedNonKings;
    state.king.lastKingPlayer = kingPlayer;

    return {
      rows,
      summary: `本回合国王：${kingPlayer}（抽到“王”）。其余玩家按牌面依次对应1号、2号、3号……，供国王点名。`,
      cellTexts: [],
      turnOrder: players.slice(), // 顺序这里简单用玩家列表本身
      collisionTexts: [],
      collisionMarks: [],
      winners: [],
      king: {
        kingPlayer,
        kingCard: "王",
        assignments, // 每人抽到的牌
        numbered: numberedNonKings, // 非国王的牌面 + 对应编号
      },
    };
  }

  globalThis.FGR_KING_CORE = { runKingRound };
})();
