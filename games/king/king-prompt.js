(() => {
    function t(v) {
        return String(v || "").trim();
    }

    function buildPrompt(packet) {
        const players = Array.isArray(packet?.players) ? packet.players : [];
        const king = packet?.king && typeof packet.king === "object" ? packet.king : {};
        const kingPlayer = t(king.kingPlayer);

        const assignments = Array.isArray(king.assignments) ? king.assignments : [];
        const numbered = Array.isArray(king.numbered) ? king.numbered : [];

        const hiddenMap = assignments.length
            ? assignments
                  .map((x) => `${t(x?.player)}:${t(x?.card)}`)
                  .filter(Boolean)
                  .join("；")
            : (Array.isArray(packet?.detailLines) ? packet.detailLines : [])
                  .map((x) => t(x))
                  .filter(Boolean)
                  .join("；");

        const revealMap = numbered.length
            ? numbered
                  .map((x) => {
                      const n = Math.trunc(Number(x?.number));
                      const no = Number.isFinite(n) ? `${n}号` : "未编号";
                      return `${no}=${t(x?.player)}(${t(x?.card)})`;
                  })
                  .join("；")
            : "无";

        return [
            `【公平裁定-回合包】【king】第${packet.round}回合`,
            `玩家=${players.join("、")}`,
            kingPlayer ? `国王=${kingPlayer}（已公开，亮牌“王”）` : "国王=未确定",
            `后台牌面映射（仅供裁判一致性，前半段禁止公开）=${hiddenMap || "无"}`,
            `揭牌后映射=${revealMap}`,
            `结论=${t(packet?.summary) || "无"}`,

            `【核心规则】除国王外，其余玩家开场均为暗牌。`,
            `【保密约束】在国王说完编号指令前，任何角色不得自报或说出自己/他人的号码与牌面。`,
            `【国王视角】国王只知道自己是“王”，不知道其他玩家对应号码；国王只能按“X号”随机点名，不得按玩家名精准指定。`,
            `【流程顺序】先国王按编号下达指令，再揭牌公开编号与牌面，最后执行指令。`,
            `【禁止抢跑】在国王指令完成前，严禁出现“我是2号”“你是1号”等台词或旁白。`,
            `【user优先】若国王是user，必须停在“等待user点号/下令”，不得替user决定。`,
            `【约束】必须严格使用本回合映射，不得改牌、改号、改国王。`,
            `【单回合约束】只推进第${packet.round}回合，不得自动开启下一回合。`,
        ].join("\n");
    }

    globalThis.FGR_KING_PROMPT = { buildPrompt };
})();
