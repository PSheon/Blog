# № 009 `city-of-agents` — 實作計畫（依專案慣例重寫）

取代原始提示。差異的理由見文末「與原始提示的差異」。
開工前先讀：`docs/HANDOFF.md`、`docs/DESIGN.md`、`README.md`、`AGENTS.md`（Next.js 16 與訓練資料不同，
先查 `node_modules/next/dist/docs/`），並把 `content/posts/slam-2d/` 當作 three.js 文章的範本。

## 0. 一句話

一座程序化生成的 3D 城市，100–300 個小人沒有人排時程，只依自己的四條需求挑下一件事；
讀者可以把決策換成「隨機」或「固定時程」，看整座城市的節奏怎麼變，並從 Overseer 面板看每個人在做什麼。
零外部資產。文章的每個數字都可重現（測試、`docs/research/` 腳本、或讀者瀏覽器即時量）。

## 1. 分支與交付

- 另開 worktree：`git worktree add ../Blog-city -b feat/city-of-agents dev`。main session 正在 `Blog/` 的 `dev` 上改檔，不要在那裡工作。
- PR 目標是 **`dev`**，不是 `main`。`dev → main` 的發佈 PR 由 Paul 自己開、自己合。不要推 `dev`、不要動 `main`。
- `zh.mdx` 帶 `draft: true`、`no: 9`。草稿在 production build 是 404，所以：
  - `e2e/smoke.spec.ts` 的測試比照 hydranet 寫法：`test.skip(response?.status() === 404, "city-of-agents is still a draft")`。
  - **不要**把頁面加進 `e2e/a11y.spec.ts` 的 `pages`（那是發佈當下那個 commit 的事）。
  - axe 兩主題、首屏不含 three、gzip 增量，改在本機量（`pnpm dev` 或暫時拿掉 draft 的 production build，不 commit），結果貼在 PR 描述並註明量法。
- 每階段一個 commit，`pnpm lint && pnpm typecheck && pnpm test` 過了才進下一階段；最後一階段加跑 `pnpm e2e && pnpm build`。
- UI 每一階段都用 Playwright 實際看過：1440 與 390 寬、深淺兩主題、console 讀一次，量過再報告。

## 2. 檔案結構（kebab-case，比照既有文章）

```
content/posts/city-of-agents/
  zh.mdx                    draft: true；frontmatter + h2 + 每個 Instrument 掛載點，內文由作者寫
  components/
    index.ts                只匯出各 lab
    labels.ts               zh/en 字串（usePathname 模式，同 slam-2d）；人名表、行動名、區域名、事件句型都在這
    store.ts                一個共用的 World + overseer 狀態，讓開場與沙盒兩個儀器共用（useSyncExternalStore）
    sim/                    純 TypeScript，不 import three、react、DOM；可在 node 測試
      types.ts  params.ts  clock.ts  city.ts  nav.ts  steering.ts
      needs.ts  utility.ts  agent.ts  world.ts  overseer.ts
    city-view3d.ts          three.js 場景類別（接收 T: typeof import("three")，同 stage3d.ts 的寫法）
    city-lab.tsx            Fig.01 開場：城市 + 播放/暫停 + 點小人跟拍，沒有旋鈕
    needs-lab.tsx           Fig.02 一個小人三天的四條需求曲線（2D canvas，無 three）
    utility-lab.tsx         Fig.03 兩個選項：拖需求與距離，看哪個勝出（2D）
    modes-lab.tsx           Fig.04 三種決策模式的「每 10 分鐘出發人數」直方圖並排；無頭跑 sim，瀏覽器即時算
    overseer-lab.tsx        Fig.05 完整沙盒：場景 + 面板（狀態表、事件流、旋鈕、時間軸、指標）
    overseer-panel.tsx      面板本體
    use-visible.ts          從 slam-2d 複製（或兩篇共用時提到 components/lab）
tests/city/                 vitest（vitest.config 只收 tests/**）；import 自 "@/content/posts/city-of-agents/components/sim/…"
docs/research/city-of-agents/
  bench.test.ts.txt         無頭效能量測，vitest 跑（repo 沒有 tsx；比照 lite3-spike 的 .txt 慣例，跑法寫在檔頭）
  RESULTS.md                結果、機器、node 版本、commit hash
```

- sim 放在文章資料夾（同 lite3 的 `sim.ts`），不新增 `lib/sim`。亂數一律用 `mulberry32`（`@/lib/ml`），不可用 `Math.random()`。
- 封面圖：`components/site/post-cover.tsx` 加一張（`viewBox="0 0 160 100"`、只用三個 signal 變數、確定性）。
- 不新增任何執行期依賴（`three` 已在）。不用 `any`，不留 `console.log`。

## 3. 模擬規格（sim/）

### 3.1 時鐘與步進
- 1 模擬日 = 24 h；1× = 現實 1 秒走 10 模擬分鐘；1×–20×；可暫停。
- **固定步長：1 tick = 1 模擬分鐘。** `world.advance(realMs)` 累積後跑整數個 tick；渲染在前後兩個 tick 之間插值。
  bench 的「tick 毫秒」、確定性、20× 下的 steering 穩定性都靠這個。
- `sunAltitude(hour) = sin((hour − 6) / 24 · 2π)`。光、天空、霧、路燈是它的函數；窗燈是 `(hour, 建築雜湊)` 的純函數
  （18:30 起隨機延遲亮、23:00 後逐棟熄）。都不另存狀態。

### 3.2 城市
- 輸入 `seed`、`N`（4–16，預設 8）。輸出街區、建築、道路（主幹道寬／巷道窄）、人行道、斑馬線、區域、小物件（路燈、長椅、樹、垃圾桶）。
- 五區：住宅、商業、餐飲街、公園、河岸。**河放在地圖一側，不做橋**。任何 `(seed, N)` 都保證五區各至少一塊、住宅／辦公／店面各至少一棟。
- 建築高度 = 雜訊 × (1 − 距市中心距離)；類型依區域（住宅矮密、辦公高、店面一層 + 遮雨棚）。
- **尺度寫進 params：步行穿越 N=8 的城市 ≈ 60 模擬分鐘**（1× 下約 6 現實秒）。效用式的距離懲罰以此為前提才有意義，走路動畫也才看得見。
- 每個小人分配一個家（住宅）與一個工作地（辦公）。每棟建築在門口人行道上有一組確定性的「站位」。

### 3.3 導航與移動
- 導航圖 = 人行道轉角 + 斑馬線兩端 + 門口節點；A*；路徑快取用有上限的 LRU。
- steering = seek + arrive + separation（權重可調）。鄰居查詢用均勻網格雜湊。位置夾在人行道／斑馬線走廊內，separation 不得把人推進建築或車道。
- 走路動畫（sin 彈跳、前傾）屬於 view，不在 sim。

### 3.4 需求與效用 — **參數待 Paul 定案**
原始表照字面跑不起來（一天需要 28.8 小時的回復時間、idle 0%、沒有早晨通勤；見
`docs/research/city-of-agents/` 將附的原型輸出）。階段 1 的第一件事是用 sim 本身重跑量測並提出一組參數給 Paul 確認，之後才寫文章會引用的數字。
固定下來的機制：
- 所有參數集中在 `sim/params.ts`，文章直接引用。
- 效用 = 需求² − 0.1 × (路程分鐘 / 60) + 留任加成（只給當前行動）。
- **遲滯**：需求 > 閾值才成為候選；一旦開始，做到需求 ≤ `doneAt`（約 0.05）或被更高效用打斷。
- 回復期間該條需求**不衰減**（明文規定）。
- 重評時機：抵達、行動完成、或每 30 模擬分鐘；**每人有隨機相位**，不可全員同一 tick 決策（否則同步度是假的）。
- 每人：三條需求隨機初值、衰減速率 ±20%。「責任」可整體關閉。
- 起點提案（待量測）：吃飯回復 1.2/h、社交回復 0.35/h、留任加成 0.3；責任曲線要調到抵達辦公室的中位數落在早上。

### 3.5 決策模式
`random` / `fsm`（8 上班、12 吃飯、18 回家）/ `utility`，共用同一個移動層，切換即時生效，並在事件記錄留一筆 `mode` 標記。

### 3.6 世界與事件
- `tick()`：時鐘 → 需求 → 到期的 agent 重新決策 → 移動。
- 事件 `departed / arrived / started / finished / idle / mode`，帶模擬時間、agent id、地點（區域 + 街區座標）、**該 agent 當下四條需求值**、`departed` 另帶起訖節點。事件只存結構化資料，句子在 `labels.ts` 組。
- 行動中的小人**留在門口站位、保持可見**；顏色 = 目標行動（路上就已是目的地的顏色），idle 另一色。
- 改人數或 seed → 重建 world、清空記錄。

### 3.7 Overseer reducer
- 純 reducer：事件流 → `{ base, events[], cursor }`。上限 5000 條；淘汰最舊事件時把它折進 `base` 快照，重播永遠從 `base` 起算。
- 任一 cursor 的快照只由記錄推導，不重新模擬：行動與地點來自事件；需求條 = 事件所帶的值 + 分段線性速率 × 經過時間；
  位置 = `departed` 的路徑依時間插值（忽略 separation）。重播時 3D 場景跟著動，畫面標示 `replay`。

## 4. 畫面

### 4.1 場景（city-view3d.ts）
- `import type * as THREE` + 動態 `import("three")`（與 slam-2d 共用同一個 chunk）。階段 2 量一次具名 import 的 tree-shaking 版本，兩個數字都記進 RESULTS.md，取符合 ≤ 200 KB gzip 增量且對回訪讀者較省的那個。
- 全部 InstancedMesh。`renderer.info.render.calls`（**含陰影 pass**）< 20：建築合併成一個 instanced box（縮放 + instanceColor）、遮雨棚一個、窗一個 quad instanced、小物件各一、小人身體與頭各一、地面／道路一個。只有建築、樹、小人投影。
- 一盞 DirectionalLight（PCFSoft）+ HemisphereLight + FogExp2；夜間有月光底色並關陰影；路燈只是自發光，不加 PointLight。
- 鏡頭：預設 45° 俯視緩慢環繞；跟拍降到街道高度；點空白處返回。
- 迴圈只在儀器在畫面內且分頁可見時跑（`useVisible` + `visibilitychange`）。`useReducedMotion()`：不環繞、時鐘預設暫停、畫一張靜止畫面。
- `setPixelRatio(min(2, dpr))`。手機預設 100 人。
- 顏色讀站內 token（`getComputedStyle`，主題切換時重讀）：工作 `chart-1`、吃飯 `chart-2`、社交 `chart-5`、回家 `chart-4`、idle `foreground`。元件裡不寫 hex；若白天場景下對比不足，量過後才為場景另定顏色並在 PR 說明。
- canvas 有可及名稱，或 `aria-hidden` 且同樣資訊以文字（Readout／狀態表）提供。

### 4.2 面板（overseer-panel.tsx）
- 桌機在場景右側（`size="wide"`）；390 寬時疊在場景下方。
- 狀態表：自寫視窗化（只渲染可見列）、4–5 Hz 更新、需求條用 ref 直接寫 style，不走 React state。每列是真的 `<button type="button">`（≥ 24 px 高），點了跟拍；捲動區 `tabIndex={0}` + 名稱。行動除了顏色還有文字。
- 事件流：不設 `aria-live`。句子由 `labels.ts` 組：`Day 2 07:40 阿凱 離開 家(住宅區 B3) → 前往 辦公(商業區 D5)`。
- 旋鈕：時間速率、小人數 10–300、決策模式、責任開關、separation 權重、seed 重生成。用 `components/ui` 的 `Slider`、`components/lab` 的 `Controls`／`Readout`。
- 時間軸：拖拉回看；切模式處有標記。
- 指標：frame time = rAF callback 內的 CPU 時間（sim + 面板更新 + `render()` 呼叫），rolling 1 秒平均；文章與面板都要寫明「不含 GPU」。
  同步度主指標 = 過去一模擬日內「單一 10 分鐘窗出發人數佔比」的峰值，並附直方圖；「同一 tick 做相同行動的比例」保留為次要讀數（夜裡大家都在睡，三種模式都接近 1，單獨看沒有鑑別力）。
- 儀器內標題用 `<p>`。佔位符與實際版面同尺寸（CLS 0）。

## 5. 測試（tests/city/）
- clock：`sunAltitude` 在 6/12/18 時為 0/1/0。
- city：同 seed deep-equal；掃多個 seed × N∈{4,8,16}：五區與三種建築齊全、家／工作地類型正確、建築都在網格內。
- nav：任兩節點可達；路徑線段不與建築相交。
- needs：單一 agent 不干預跑 3 日，四條需求每日各至少觸發一次；沒有需求長時間釘在 1。
- utility：距離相同高需求勝；需求相同近者勝；遲滯——開始後低於閾值不會立刻離開。
- world：300 agents × 3 日無例外；時間戳單調；同 seed 兩次事件流完全相同；決策 tick 不全員對齊；走完後所有位置都在走廊內。
- overseer：任一 cursor 的快照 == 逐事件重算；淘汰後（> 5000）仍成立。
- 這些測試同時是文章數字的來源：每日活動時間佔比、抵達辦公室時刻分佈、三種模式的出發峰值。

## 6. 效能量測
- `bench.test.ts.txt`：agents ∈ {50,100,300,1000} × N ∈ {4,8,16}，各跑 1 模擬日（1440 tick），記 tick 平均與 p95 毫秒；RESULTS.md 附機器、node 版本、commit hash、跑法。
- 瀏覽器 frame time 由儀器即時顯示，不預錄。

## 7. 驗收
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` 全過（本篇的 smoke test 在草稿期間會 skip，屬預期）。
- 本機量測並貼進 PR：該頁 gzip 增量 ≤ 200 KB 且首屏不含 three；300 agents、N=8 在 M 系列 Mac 上 frame time < 8 ms（註明為 CPU 時間）；draw calls；axe 兩主題無錯（對 dev server 跑）。
- 規格未定義的行為：選最簡單的實作，列在 PR 描述。

## 8. 階段
1. `sim/` 全部 + 測試 + bench；**先交需求參數的量測與提案給 Paul 確認**。
2. `city-view3d` + `city-lab`：城市與日夜，無小人；量 three 的兩種 import 方式。
3. 小人移動 + 三種決策模式 + 共用 `store.ts`。
4. `overseer-lab`：面板、跟拍、重播。
5. 2D 儀器（needs / utility / modes）、`zh.mdx` 骨架（draft）、封面圖、smoke test、RESULTS.md、PR → `dev`。

## 與原始提示的差異
| 原始 | 這裡 | 為什麼 |
| --- | --- | --- |
| 在 `dev` 工作、PR 到 `main` | worktree + `feat/city-of-agents`，PR 到 `dev` | main session 同時在 `dev` 改檔；`dev` 領先 `main` 80 個 commit；main 只由 Paul 發佈 |
| 未提 draft | `draft: true`、`no: 9` | 骨架不能上線；連帶 e2e／axe 的驗法要改 |
| `lib/sim/`、PascalCase 元件、`bench.ts` | `components/sim/`、kebab-case、`index.ts`/`labels.ts`/`store.ts`、`bench.test.ts.txt` | 既有八篇的慣例；repo 沒有 TS runner |
| 一個大儀器 | 五個儀器，開場只做一件事，沙盒放最後 | DESIGN §6 |
| 只 import three 的具體模組 | 先沿用共用 chunk，兩種都量 | 現有 three chunk ≈ 188 KB gzip，與 slam-2d 共用快取 |
| 顏色藍橘綠灰白 | `chart-*` token | DESIGN §2：不寫 hex；顏色不是唯一訊號 |
| 需求表照表實作 | 機制固定、數值待量測後定案 | 原型量到：回復時間需求 28.8 h/日、idle 0%、抵達辦公室中位數 13:30 |
| 未定義 tick | 1 tick = 1 模擬分鐘 + 渲染插值；城市尺度寫進 params | 10 模擬分鐘/秒下，真實步速 = 840 m/秒 |
| 同步度 = 同 tick 同行動比例 | 主指標改出發峰值 + 直方圖 | 夜間三種模式都 ≈ 1 |
| 5000 條上限 | 加 base 快照；事件帶需求值與路徑 | 否則被淘汰的 agent 狀態未知、重播無法推導需求與位置 |
| 行動中小人是否可見未定 | 留在門口站位 | 否則城市多數時間是空的，顏色圖例與跟拍沒有對象 |
