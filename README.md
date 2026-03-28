# 游戏裁定器（SillyTavern 扩展）

> 面向多人互动回合的本地裁定扩展。
> 当前主要支持：**飞行棋（flight）** 与 **国王游戏（king，抽牌版）**。
> 所有随机与结算均在本地完成。

---

## 功能总览

- 🛫 **飞行棋裁定**
  - 自动识别玩家（手动名单 + 聊天说话人 + user别名）
  - 支持 1d6 / 2d6（自动或固定）
  - 支持地图事件（move/text）、碰撞、终点判定
  - 支持可视化棋盘、点击骰盅触发回合

- ♠️ **国王游戏（抽牌版）**
  - 牌池按人数自动生成：`王 + A + 2 + 3 + ...`
  - 抽到 `王` 的玩家为国王
  - 非国王按牌面顺序编号：`A=1号, 2=2号, 3=3号...`
  - 支持黑桃页手动抽牌：点击一张牌后可将该牌作为 **user 下一轮预设牌**

- 🎬 **导演模式**
  - 飞行棋：弹出导演面板，手动改每位玩家落点并应用到回合包
  - 国王游戏：弹出导演面板，手动指定“牌面 -> 玩家”映射并应用到回合包

- ↩️ **回合管理**
  - 回退上一回合（Undo）
  - 前进下一回合（Redo）
  - 飞行棋/国王分别支持进度重置入口

- 🧩 **SillyTavern 原生集成**
  - 扩展设置区启用/禁用
  - 可长按扩展按钮打开主面板（可关闭）
  - 主面板支持多页签（地图 / 抽牌 / 编辑 / 设置），并记忆上次打开页签（取决于当前代码版本）

---

## 安装方式

### 方式一：SillyTavern 内置安装（推荐）

1. 打开 SillyTavern
2. 进入 `Extensions`
3. 点击 `Install extension`
4. 粘贴仓库 URL 并安装
5. 刷新页面后，在 Third-party 扩展中启用“游戏裁定器”

---

### 方式二：手动安装

1. 下载仓库 ZIP 并解压
2. 放到目录：

`SillyTavern/public/scripts/extensions/third-party/fair-game-referee`

3. 刷新 SillyTavern 页面并启用扩展

---

## 使用说明

## 1）启用插件

在扩展设置中勾选：
- 启用插件
- （可选）启用长按扩展按钮打开面板

---

## 2）飞行棋（flight）

### 文本触发
在聊天中输入类似：
- `飞行棋`
- `玩飞行棋`
- `开始玩飞行棋`

之后输入“下一回合 / next round”等可继续推进。

### 地图页点击触发
在地图页点击骰盅，可直接触发一回合飞行棋裁定与动画。

---

## 3）国王游戏（king）

### 文本触发
在聊天中输入类似：
- `国王游戏`
- `玩国王游戏`
- `开始玩国王游戏`

之后输入“下一回合 / next round”等可继续推进。

### 黑桃页（抽牌页）
- 黑桃页会按当前玩家数展示对应张数的牌
- 点击一张牌翻开后：
  1. 该牌写入 user 的“下一轮预设牌”
  2. 立即触发下一轮国王游戏裁定
- 抽完后牌桌可保持当前状态；是否重洗由“洗牌按钮”控制（取决于当前代码版本）

---

## 4）导演模式

在设置中把结果模式切到 `director`：

- 飞行棋回合裁定后：弹出飞行棋导演面板，可改落点并应用
- 国王回合裁定后：弹出国王导演面板，可指定每张牌对应玩家并应用

应用后会更新本回合回合包提示词，用于约束 LLM 后续叙事。

---

## 5）国王游戏叙事约束（提示词重点）

当前国王规则约束为：
- 国王（王）可公开
- 其他玩家默认暗牌
- 国王下令前，不应提前公开他人号码/牌面
- 国王应按编号点名，揭牌后再对应到具体玩家

---

## 设置项说明

## 编辑页
- 玩家名单（支持多名单）
- user 别名、统一名
- 名称黑名单

## 设置页
- 下一回合触发词
- 飞行棋启动词 / 重开词
- 国王游戏启动词
- 骰子模式（飞行棋内部使用）
- 结果模式（strict / director）
- 地图 JSON 高级编辑与校验

---

## 资源文件要求（本地）

## 1）音效目录

`public/scripts/extensions/third-party/fair-game-referee/assets/sfx/`

常用文件名（按你当前代码）：
- `Dice.mp3`（飞行棋骰子）
- `shuffle.mp3`（洗牌）
- `deal.mp3`（发牌）
- `flip.mp3`（翻牌）

> Linux/Android 区分大小写，文件名必须与代码一致。

## 2）扑克牌 SVG 目录

`public/scripts/extensions/third-party/fair-game-referee/assets/cards/`

推荐命名：
- 普通牌：`点数 + 花色 + .svg`
- 花色：`S/H/D/C`（黑桃/红桃/方片/梅花）
- 示例：`AS.svg`, `10H.svg`, `QD.svg`, `KC.svg`
- 国王牌：`JOKER.svg`

---

## 第三方资源与署名

- **Lucide**
  - 项目地址：https://lucide.dev
  - 许可证：ISC License
  - 许可证文本：https://github.com/lucide-icons/lucide/blob/main/LICENSE

- **Remix Icon**
  - 项目地址：https://remixicon.com/
  - 许可证：Apache License 2.0
  - 许可证文本：https://github.com/Remix-Design/RemixIcon/blob/master/License

- **Vector Playing Cards（扑克牌 SVG）**
  - 作者：Byron Knoll
  - 项目地址：http://code.google.com/p/vector-playing-cards/
  - 许可证：CC0 1.0

- **音效资源（Pixabay）**
  - Dice 音效：
    - 来源：https://pixabay.com/sound-effects/film-special-effects-dice-142528/
    - 署名文本：Sound Effect by u_qpfzpydtro from Pixabay
  - Flip 音效：
    - 来源：https://pixabay.com/sound-effects/flip-card-91468/
    - 署名文本：Sound Effect by freesound_community from Pixabay
  - 许可证：Pixabay License（以资源页实时条款为准）

- **音效资源（ElevenLabs Sound Effects）**
  - 平台地址：https://elevenlabs.io/app/sound-effects
  - 用途：部分“发牌/洗牌”音效由该平台生成后再剪辑
  - 许可说明（按 ElevenLabs 条款）：
    - 免费计划生成内容：不可用于商业用途；公开发布时需按条款归因（如包含 `elevenlabs.io` 或 `11.ai`）
    - 付费计划生成内容：通常可商用（非 Beta 服务），以当时订阅协议/服务条款为准
  - 说明：若未来音效来源或授权状态变更，本项目会同步更新此节

详细清单见：`THIRD_PARTY_NOTICES.md`

如有遗漏、署名不完整或侵权问题，请联系维护者处理，本项目会第一时间修正或下架相关资源。

---

## 免责声明

本扩展仅提供回合裁定与提示词约束，不对模型生成内容承担法律责任。
如发现素材授权、署名或侵权问题，请及时联系维护者处理。
