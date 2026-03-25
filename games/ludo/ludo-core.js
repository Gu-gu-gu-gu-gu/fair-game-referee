(() => {
    function parseFlightMap(settings) {
        try {
            const map = JSON.parse(String(settings?.flightMapJson || ''));
            if (!map || typeof map !== 'object') return { winPosition: 20, events: [] };
            if (!Number.isFinite(Number(map.winPosition))) return { winPosition: 20, events: [] };
            if (!Array.isArray(map.events)) return { winPosition: Number(map.winPosition), events: [] };
            return map;
        } catch (_e) {
            return { winPosition: 20, events: [] };
        }
    }

    function getMapStartCell(map) {
        const events = Array.isArray(map?.events) ? map.events : [];
        const hasZero = events.some(e => Math.trunc(Number(e?.at)) === 0);
        return hasZero ? 0 : 1;
    }

    function runFlightRound(options = {}) {
        const players = Array.isArray(options.players) ? options.players : [];
        const state = options.state || {};
        const settings = options.settings || {};
        const resolveDiceCount = typeof options.resolveDiceCount === 'function' ? options.resolveDiceCount : (() => 1);
        const samePlayers = typeof options.samePlayers === 'function' ? options.samePlayers : (() => false);
        const roll = typeof options.roll === 'function'
            ? options.roll
            : (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        const map = parseFlightMap(settings);
        const win = Math.max(1, Math.trunc(Number(map.winPosition) || 20));
        const startCell = getMapStartCell(map);

        state.flight = state.flight || { positions: {} };

        const eventMap = new Map(
            (Array.isArray(map.events) ? map.events : []).map(e => [Math.trunc(Number(e.at)), e])
        );

        for (const p of players) {
            const raw = Number(state.flight.positions[p]);
            state.flight.positions[p] = Number.isFinite(raw) ? Math.trunc(raw) : startCell;
            if (state.flight.positions[p] < startCell) state.flight.positions[p] = startCell;
            if (state.flight.positions[p] > win) state.flight.positions[p] = win;
        }

        let turnOrder = [];
        if (samePlayers(state.turnOrder, players)) {
            turnOrder = state.turnOrder.slice();
        } else {
            turnOrder = players.slice();
            for (let i = turnOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
            }
            state.turnOrder = turnOrder.slice();
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
        const turns = [];

        for (let idx = 0; idx < turnOrder.length; idx++) {
            const actor = turnOrder[idx];
            const startPos = Math.trunc(Number(state.flight.positions[actor] ?? startCell));
            const dice = Array.from({ length: flightDiceCount }, () => roll(1, 6));
            const d = dice.reduce((a, b) => a + b, 0);

            rolls[actor] = { dice, total: d, diceCount: flightDiceCount };

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
                    ? '（该玩家本回合已行动，已完成任务不撤销）'
                    : '（该玩家本回合未行动）';

                collisionTexts.push(
                    `${byActor} 在${hitPos}格${phaseLabel}撞到 ${victim}，被撞前位置${victimBeforePos}${actedTag}；被撞者回起点${startCell}并结算起点事件后到${victimPos}`
                );

                collisionMarks.push({
                    pos: hitPos,
                    phase: phaseKey,
                    actor: byActor,
                    victim,
                    victimBeforePos,
                    victimAfterPos: victimPos,
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

            let logText = '';
            let logPos = null;
            if (eventText) {
                logText = eventText;
                logPos = landedByDice;
            } else if (finalCellText) {
                logText = finalCellText;
                logPos = finalPos;
            }
            if (logText) {
                cellTexts.push(`${actor}@格${logPos}:${logText}`);
            }

            turns.push({
                player: actor,
                order: idx + 1,
                startPos,
                dice,
                total: d,
                landedByDice,
                eventMove,
                eventText,
                finalPos,
                finalCellText
            });

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
            turns,
        };
    }

    globalThis.FGR_LUDO_CORE = {
        parseFlightMap,
        getMapStartCell,
        runFlightRound,
    };
})();
