# № 005 HydraNet 文章：內容研究筆記

2026-09-18 · 研究 session（paul-d9）寫給 Paul 與主 session（paul-54）。只動了 `docs/research/`，沒有 commit。

## 一句話結論

box IoU 低的原因不是 loss，也不是 8×8 太粗，而是**「挑一格、再從那一格回歸四個距離」這個輸出方式本身**。把 box head 換成「每條邊是一個 softmax 分佈的期望值」（integral / soft-argmax），同樣 16k 樣本，box IoU 從 0.56 升到 0.74，每邊誤差從 2.2 px 降到 1.1 px。另外：三個 seed 下**看不到多任務讓準確度變好的證據**，反而是共享主幹要付一點準確度的代價；HydraNet 真正省下的是算力。文章應該照這個事實寫。

## 1. 量測

腳本：[hydranet-spike/hydra-spike.ts.txt](hydranet-spike/hydra-spike.ts.txt)（副檔名加了 `.txt`，免得被 tsc/eslint 掃到；用 `node --experimental-transform-types` 跑，只 import `lib/ml/autograd.ts`）。原始輸出：[hydranet-spike/results.jsonl](hydranet-spike/results.jsonl)，彙總用 `agg.py`。

設定沿用 paul-54 的 spike：32×32 RGB、trunk 3→8→16→16（兩次 max-pool）、Adam 3e-3、batch 8、16k 樣本、500 張固定測試集、**每個設定 3 個 seed**。資料是我重寫的代理資料（漸層雜訊背景上一個隨機顏色的圓／方／三角，半徑 4–10 px）；前景色完全隨機，會撞背景色，所以比 paul-54 那份難，絕對值不能和 0.63/0.85 直接比，**只看同一張表內的相對差**。

數字是 平均 [最小, 最大]。

| 設定 | box IoU | 每邊誤差 px | mask IoU (16×16) | 由 mask 推 box 的 IoU | samples/s |
| --- | --- | --- | --- | --- | --- |
| base：8×8 heat + ltrb，MSE | 0.561 [0.511, 0.610] | 2.22 | 0.682 [0.641, 0.739] | 0.627 | 406 |
| base，只有 box | 0.546 [0.530, 0.567] | 2.44 | – | – | 590 |
| base，只有 mask | – | – | 0.789 [0.785, 0.795] | 0.716 | 401 |
| loss 換 L1 | 0.601 [0.594, 0.605] | 1.96 | 0.734 | 0.670 | 396 |
| loss 換 L1 + GIoU | 0.594 [0.580, 0.611] | 2.12 | 0.624 | 0.633 | 403 |
| 輸入加 CoordConv 座標通道 | 0.553 [0.545, 0.561] | 2.30 | 0.644 | 0.610 | 358 |
| head 移到 16×16 | 0.571 [0.546, 0.612] | 2.11 | 0.666 | 0.661 | 394 |
| 16×16 + U-Net skip | 0.541 [0.435, 0.661] | 2.39 | 0.639 [0.457, 0.806] | 0.637 | 285 |
| 16×16 + skip + L1 + GIoU | 0.640 [0.632, 0.645] | 1.78 | 0.577 | 0.576 | 286 |
| 同上，只有 box | 0.630 [0.592, 0.663] | 1.90 | – | – | 313 |
| **integral box head + skip（兩個 head）** | **0.735 [0.681, 0.783]** | **1.15** | 0.812 [0.779, 0.849] | 0.706 | 309 |
| integral，只有 box | 0.794 [0.782, 0.805] | 0.83 | – | – | 310 |
| skip，只有 mask（對照） | – | – | 0.825 [0.812, 0.835] | 0.737 | 315 |
| integral 兩個 head，32k 樣本 | 0.808 [0.807, 0.810] | 0.76 | 0.893 [0.892, 0.895] | 0.789 | 314 |

參考上限：拿**完美的** 16×16 ground-truth mask 取外框，box IoU 也只有 0.865（2 px 的量化誤差）。

samples/s 是 6 個 process 同時跑時量的，而且含了用 JS 產生資料的時間，比單獨跑低；互相比較可以，別拿來當絕對預算。

### 讀法

1. **paul-54 的四個猜測，三個沒中。** 16×16 沒用（0.571 vs 0.561，在 seed 的雜訊內）；換 loss 只有 +0.03–0.04，不過 seed 間的變異明顯變小；CoordConv 對「相對於格子」的回歸沒用，這在預期內，因為 ltrb 本來就不需要絕對座標。
2. **「由 mask 推 box」這個 baseline 在舊設計下真的贏過 box head**（0.627–0.67 vs 0.56–0.60）。這是一個很好的文章橋段：辛苦訓練的 box head 輸給對 mask 取 min/max。但它的天花板是 0.865，而且 mask 上一個離群像素就會把框撐大。
3. **Integral head 是唯一明顯的改善。** 做法：head 輸出 4 張 16×16 的圖；「左邊界」那張沿 y 取平均變成 16 個 logit → softmax → 對位置（0–32 px）取期望值，其他三邊同理；loss 是座標的 L1。它可微、沒有新參數、輸出是連續值所以沒有量化誤差，而且那四個 1-D 分佈可以直接畫出來（讀者會看到四個峰在訓練中變尖、滑到物體邊緣）。出處是 DSNT（Nibali 2018）與 integral regression／soft-argmax。
4. **多任務沒有讓準確度變好，這裡是付出代價。** 結構相同的對照：mask 單獨 0.825 → 一起訓練 0.812；box 單獨 0.794 → 一起 0.735。base 架構也一樣（mask 0.789 → 0.682）。loss 權重我沒調，3 個 seed，代理資料，所以只能說「沒看到正遷移」，不能說「一定是負遷移」。
5. **算力的帳是成立的。** base：兩個 head 共用主幹 406/s；分成兩個網路各跑一次等於 1/(1/590 + 1/401) ≈ 239/s。共享主幹省了約 1.7 倍。

### 還沒解決

- **Integral head 只適用於一張圖一個物體。** 要放多顆水果就得回到 CenterNet 式（heatmap 峰值 + 每個峰的尺寸），而那正是表裡比較弱的那一類。建議這篇就定為一張圖一顆水果，多物體留到文末「和真實系統差在哪」。這需要 Paul 拍板。
- **時間預算。** 贏的設定約 310/s（平行負載下），16k 樣本大概 50 s，32k 要 100 s；而且 32k 才到 0.81/0.89。要嘛找速度（skip 那層 conv 是 32→8 @16×16，最貴；可以試 skip 只接 8 個通道），要嘛接受 16k 的 0.74/0.81。
- 真的 emoji 還沒測。emoji 有內部紋理和抗鋸齒邊緣，比純色形狀難；但 alpha 當 ground truth 是乾淨的。要在瀏覽器裡才能量。

## 2. 這個設計需要的新 op

| op | 用途 | 備註 |
| --- | --- | --- |
| `concatRows`（通道方向串接） | U-Net skip | 很簡單；現在只有 `concatCols` |
| `meanAxis` 或專用的 `marginal`（[C, h·w] → [C, w] 或 [C, h]） | integral head | |
| `softmax`（逐列，不帶 causal mask） | integral head | 可以從 `causalSoftmax` 改 |
| `expectation`（與常數位置向量內積）+ `l1` loss | integral head | 內積可用 `matmul` 配常數 Mat；`l1` 是新的 |

spike 裡這些是用 `tape.record` 硬塞的（loss 對四個座標的梯度用中央差分），正式版每個都要 gradient check。不需要 GIoU、focal loss、stride-2 conv、bilinear upsample。

## 3. 建議的文章骨架

沿用 № 004 的寫法：開場就是儀器，按下去先看到結果，再解釋。

1. **開場儀器**：左邊是即時產生的 emoji 訓練圖，右邊疊上模型目前畫的框和 mask。按「開始訓練」，框從亂跳到貼住水果，mask 從雜訊變成輪廓。
2. **資料不用錢**：在 canvas 上畫 emoji，alpha 通道就是 mask，mask 的外框就是 box。互動：拖一顆水果，看標註跟著動。
3. **一個身體，兩個頭**：主幹與兩個 head 的圖，參數表。Karpathy 在 PyTorch DevCon 2019 講的 HydraNet：共享主幹是為了攤平算力。
4. **框為什麼這麼難**：先給讀者看直覺的做法（挑一格、回歸四個距離）和它的成績，再給他看「對 mask 取 min/max」就贏過它。互動：兩種框疊在同一張圖上。
5. **把邊界變成分佈**：integral head。互動：四條 1-D 分佈在訓練中變尖。
6. **共享是有代價的**：開關 head（只 box／只 mask／兩個），用固定 seed 重訓，顯示量到的數字。誠實寫：這個規模下沒看到 1+1>2，看到的是省 1.7 倍算力、付一點準確度。對照 Mask R-CNN 表裡多任務訓練讓 box AP +0.9，以及 Standley 2020 的「哪些任務該一起學」。
7. **它會在哪裡失敗**：兩顆水果、前景和背景同色、沒看過的 emoji、不同作業系統的 emoji 字型。
8. **和真的系統差在哪**：多物體（CenterNet／FCOS）、loss 權重（Kendall 2018 的 uncertainty weighting）、特徵快取與各 head 分開微調。

### emoji 資料的坑

- 各平台的 emoji 是不同的圖：Apple 是 sbix 點陣、Google 是 CBDT 點陣、Windows 是 COLR 向量，字寬和外框都不同。所以每個讀者訓練的是「自己系統的水果」，文章裡的數字要寫成「在我的機器上」。好處是這本身是一個可以講的點，壞處是 e2e 測試不能斷言像素。
- 要偵測 tofu（沒有彩色 emoji 字型的 Linux）：畫完用 `getImageData` 檢查是否有彩色像素，沒有就退回一組內建圖。內建圖若用 Twemoji 要標示 CC-BY 4.0；Noto Emoji 的圖檔是 Apache 2.0、字型是 OFL。
- alpha 是抗鋸齒的，mask 目標用 alpha ≥ 0.5；box 用同一個門檻取外框，兩個標註才會一致。
- Node 裡沒有 canvas，所以資料產生器要分兩層：純函式（給 alpha 圖 → 標註）可以用 vitest 測，畫 emoji 那層只在瀏覽器跑。

## 4. 參考資料（都查過存在）

- Karpathy，PyTorch DevCon 2019，HydraNet：https://cleantechnica.com/2019/12/05/teslas-andrej-karpathy-talks-autopilot-video/ ；整理：https://medium.com/@rlancemartin/teslas-arc-of-ai-progress-3a7c3e8e24c9
- Nibali et al. 2018，DSNT，*Numerical Coordinate Regression with CNNs*：https://arxiv.org/abs/1801.07372
- Liu et al. 2018，CoordConv：https://arxiv.org/abs/1807.03247 （這裡量到沒幫助，可以放 sidenote 說明為什麼）
- Zhou et al. 2019，CenterNet，*Objects as Points*：https://arxiv.org/abs/1904.07850
- Rezatofighi et al. 2019，GIoU：https://arxiv.org/abs/1902.09630
- He et al. 2017，Mask R-CNN（多任務訓練 +0.9 box AP 的消融）：https://openaccess.thecvf.com/content_ICCV_2017/papers/He_Mask_R-CNN_ICCV_2017_paper.pdf
- Standley et al. 2020，*Which Tasks Should Be Learned Together*：https://arxiv.org/abs/1905.07553
- Kendall, Gal, Cipolla 2018，用 uncertainty 加權多任務 loss：https://arxiv.org/abs/1705.07115
- emoji 跨平台差異：https://nolanlawson.com/2022/04/08/the-struggle-of-using-native-emoji-on-the-web/ ；Twemoji 授權：https://github.com/jdecked/twemoji ；Noto Emoji：https://github.com/googlefonts/noto-emoji

Mask R-CNN 的 +0.9 我是從搜尋摘要看到的，沒有開 PDF 對表格；寫進文章前要對一次。

## 5. 要 Paul 決定的事

1. 一張圖一顆水果（可以用 integral head，成績好）還是多顆（要 CenterNet 式，目前成績差）？我建議一顆。
2. 第 6 節照實寫「沒看到多任務的好處」可以嗎？這會改變文章的主張：從「兩個任務互相幫忙」變成「共享是為了省算力，而且有代價」。
3. 訓練時間：接受約 50 s，還是先花時間把 conv 再壓快？
