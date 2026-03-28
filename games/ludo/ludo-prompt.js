(() => {
    function buildPrompt(packet) {
        const uniqLines = (arr = []) => {
            const set = new Set();
            const out = [];
            for (const x of arr) {
                const t = String(x || "").trim();
                if (!t || set.has(t)) continue;
                set.add(t);
                out.push(t);
            }
            return out;
        };

        const takeLimit = (list = [], limit = 6) => {
            const lim = Math.max(1, limit);
            if (list.length <= lim) return list;
            return list.slice(0, lim).concat(`…其余${list.length - lim}条省略`);
        };

        const orderLine =
            packet.turnOrder && packet.turnOrder.length
                ? `顺序=${packet.turnOrder.join(" -> ")}`
                : "顺序=无";

        const winnerLine =
            packet.winners && packet.winners.length
                ? `到达终点=${packet.winners.join(" / ")}`
                : "到达终点=暂无";

        const collisionLines = takeLimit(
            uniqLines(packet.collisionTexts || []),
            6
        );
        const cellLines = takeLimit(uniqLines(packet.cellTexts || []), 8);

        const detailText =
            Array.isArray(packet.detailLines) && packet.detailLines.length
                ? packet.detailLines.join("；")
                : String(packet.detail || "");

        return [
            `【游戏裁定-回合包】【${packet.gameType}】第${packet.round}回合`,
            `玩家=${packet.players.join("、")}`,
            orderLine,
            `掷骰提要=${detailText}`,
            `结论=${packet.summary}`,
            collisionLines.length
                ? `相撞=${collisionLines.join("；")}`
                : "相撞=无",
            cellLines.length
                ? `格子事件=${cellLines.join("；")}`
                : "格子事件=无",
            winnerLine,

            `【强约束】你必须严格按上述结果叙事，不得改判胜负。`,
            `【持续进行】在有人到达终点之前，游戏持续进行；不得私自判定“突然结束/强制收尾”。`,

            `【局与回合定义】“一回合/一盘/一局”=从起点到终点的整盘；“一回合”=所有玩家各完成一次掷骰与任务。`,
            `【下一回合定义】“下一回合/新回合/next round/下一回合”=所有玩家在上一回合完成后，再按顺序各进行一次新的掷骰与任务，不是回到起点重开。`,
            `【禁止误判重开】除非用户明确说“重玩/重开/重新开始”，否则不得把“下一回合/下一回合”解释为“回到起点重头开始”。`,

            `【任务归属】每个格子任务只属于该玩家本人完成，禁止他人代做、替做、转包。`,
            `【禁止钻空子】禁止用“口头宣布完成/场外操作/规则外技巧/偷换概念”跳过或规避格子任务。`,
            `【禁止免做】除非裁定结果明确写出“免任务/跳过任务”，否则任何玩家都必须完成其落点任务。`,
            `【禁止改派】不得把A玩家任务改派给B玩家；不得把多人任务压缩为单人代办。`,

            `【任务推进约束】先简短回顾已完成任务，再重点补完尚未完成的玩家剧情。`,
            `【分批完成】每次回复只推进1~4名玩家的任务，不要一次写完所有玩家的任务；未完成者请在结尾列出“待处理玩家清单”。`,
            `【需要暂停】当本回合仍有人未完成任务时，回复末尾必须停在“等待继续/确认下一步”的状态。`,
            `【用户结尾引导】如果轮到 user 的任务，请在结尾向 user 提出明确选择（如对象/顺序/方式），并停在 user 决定处，不要替 user 直接决定。`,
            `【禁止跳回合】在本回合所有玩家任务都完成之前，严禁发起、描写或暗示下一回合掷骰/抽牌。`,
            `【禁止自动开新回合】除非有人明确发出“下一回合/新回合/next round/下一回合”等指令，否则不得进入第${packet.round + 1}回合。`,
            `如果本回合剧情尚未写完，请继续完成第${packet.round}回合内容，不得偷跑到下一回合。`,
            `【自然收束】结尾可以自然收束：大家各自交流/休息/碰杯/喝水等都可以，不需要集体等待或看向 user 来决定是否继续；只要不自行开启下一回合即可。`,
        ].join("\n");
    }

    globalThis.FGR_LUDO_PROMPT = { buildPrompt };
})();
