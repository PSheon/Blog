# 研究：「光是怎麼被算出來的」上下篇提案（2026-09-21）

Paul 的要求：先研究題目。我做了三件事：在這台 Mac（M4 Pro）上實測兩個 WebGPU spike；派三個 agent 分頭查證平台事實、前人作品與文獻、Sketchbook 授權，每個來源都實際打開過；再逐條對照提案和這個專案的規矩（DESIGN.md、HANDOFF、記憶）。**沒有改 repo 裡任何檔案**，所有東西都在 `Desktop/Paul/light-work/`：

- `spike/index.html`：smallpt 球體場景，1 spp/幀
- `spike/bvh.html`：三角形 + SAH BVH，從 876 到 100 萬個三角形
- `research-webgpu.md`：平台事實
- `research-prior-art.md`：前人作品與文獻
- `research-sketchbook.md`：授權與資產

## 結論先講

技術上完全可行，而且比提案假設的快很多。但提案有四個問題要 Paul 先決定，其中兩個是硬傷：

1. **Sketchbook 資產不是「自有」，島的紋理不能轉載**（硬傷）。
2. **篇幅**：兩篇各 12–13 節、10–11 個儀器，遠超 DESIGN.md 的 10 分鐘上限（硬傷）。
3. **「第一個」說不出口**：8 天前剛出現一個幾乎同規格的 WebGPU 路徑追蹤器；會走動的瀏覽器路徑追蹤 2016 年就有了。
4. **跟站的定位脫節**：首頁標題是「從零實作機器學習模型」，這個系列裡沒有任何學習。

## 1. 實測（這台 Mac，2026-09-21）

所有數字都是 512²、每像素一條路徑、megakernel、workgroup 8×8。腳本在 `spike/`，用 `node run.mjs` 和 `node runbvh.mjs <chrome|webkit|swiftshader> <三角形數>` 重跑。

**球體場景（smallpt，9 顆解析球，Lambert、鏡面、玻璃，輪盤賭）**

| 瀏覽器／adapter | spp/s | Mrays/s | 32 格私有堆疊的代價 |
|---|---|---|---|
| Chrome 153（Metal） | 2,116 | 4,028 | −24% |
| WebKit 26.6（Safari 引擎） | 1,869 | 3,563 | −29% |
| Playwright 內建 Chromium（**SwiftShader，CPU**） | 14 | 27 | — |

**三角形 + BVH**：Cornell box 加 6 個環面，SAH 16 桶，葉 ≤ 4，節點 32 bytes，近子先訪，只有 Lambert、沒有 NEE。

| 三角形 | BVH 建構（JS 主執行緒） | 每光線遍歷步數 | Mrays/s（Chrome） | spp/s |
|---|---|---|---|---|
| 876 | 6 ms | 11.8 | 401 | 321 |
| 29k | 105 ms | 14.7 | 307 | 246 |
| 101k | 260 ms（WebKit 880 ms） | 15.3 | 290（WebKit 277） | 232 |
| 301k | 745 ms | 15.9 | 273 | 218 |
| 999k | 2.5 s（WebKit 7.3 s） | 16.5 | 253（WebKit 236） | 203 |
| 101k，SwiftShader | — | 15.3 | 8 | 6 |

這些數字改變了提案的幾個前提：

- **幾何成本壓成 log，已經量得出來。** 三角形多了 1,000 倍，每光線步數只從 11.8 變成 16.5，吞吐量只掉 37%。I4 的論點直接成立。
- **收斂看得到，但「一幀 1 spp」太保守。** 在 M 系列上，1→4096 spp 在 10 萬個三角形時約 18 秒。I1 可以每幀跑多個 spp、邊跑邊畫 MSE 曲線。內顯沒量過（手邊沒有），要找讀者或 Paul 的其他機器。
- **建構要進 Worker。** 100 萬個三角形在 WebKit 主執行緒卡 7 秒。提案把它列在「風險」，其實是必做。
- **堆疊溢位：0 次**（23 層深，32 格夠用）。私有堆疊本身要付 24–29% 的代價，這可以寫進第 10 節。
- **f32 精度的問題上了畫面。** smallpt 用半徑 10⁵ 的球當牆，spike 截圖的牆上出現條紋（`spike/chromium-headed-channel-chrome.png`）。這是提案「只有 f32」那一列最好的示範圖，文章裡牆一律用三角形。
- **CI 只有 CPU adapter。** GitHub 的 Linux runner 會落到 SwiftShader，比 Metal 慢 30–150 倍，而且要兩個旗標才拿得到 adapter（`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`）。「CPU vs GPU 32² 64 spp 逐像素」這種小測試在 CI 跑得動，其他 GPU 測試要縮到很小的解析度。檢查結果要讀回 buffer，不要截 canvas。

## 2. 平台事實（詳見 `research-webgpu.md`）

| 提案的說法 | 查證結果 |
|---|---|
| 無硬體光追 | **對。** gpuweb #535 從 2020 年開到現在，排在 milestone「4+」；proposals 資料夾裡沒有光追提案。 |
| 自己建 BVH 是「文章存在的理由」 | **要改說法。** `three-mesh-bvh/webgpu`（v0.9.15，標為不穩定）已經能打包 TLAS+BLAS 給 WGSL 用。理由要改成「為了看懂它」，不能說「因為沒有」。 |
| 無 subgroup 原語 | **不對。** Chrome 134 起有，約 69% 的裝置支援；這台 Mac 的 Chrome、WebKit 都回報 `subgroups`。I11 的「活躍執行緒比例」可以直接用 subgroupBallot 量。 |
| storage buffer 上限 | 預設 binding 128 MiB、每個 stage 8 個 storage buffer、4 個 bind group（只有 19% 的 adapter 超過 4 個）。「打包成少數扁平 buffer」是對的，而且是必要的。 |
| 長 kernel 會被殺 | Windows TDR 預設 2 秒、Chrome watchdog 約 10 秒；2 分鐘內當兩次，這頁就不能再用 WebGPU。漸進式是對的。 |
| 無 bindless | 對。WGSL 沒有 `binding_array`；下篇用 `texture_2d_array` 是對的。 |
| 每階段毫秒數 | timestamp-query 被量化到 100 µs。6 ms 的階段誤差約 2%，夠用；0.2 ms 的 refit 就量不準，要改成跑多次取平均。 |
| 手機 | Safari 26（iOS/macOS）預設開、Chrome Android 121+。Firefox 只有 Windows 和 Apple Silicon Mac。估計 70–85% 的手機讀者拿得到 adapter，**其餘要有靜態圖或影片的退路**。 |

## 3. 前人作品（詳見 `research-prior-art.md`）

- **Lucida**（github.com/DhanushKrishna4/Lucida，2026-09-13 建立，0 顆星）：從零寫的 WebGPU 路徑追蹤器。SAH BVH、Sobol-Owen、NEE + power-heuristic MIS、GGX、介電質、à-trous，megakernel/wavefront 可即時切換並量過（512²、8 次反彈，wavefront 快 1.22 倍），白爐平均 1.00001，261 個測試。它是工具加 README，不是教學。但上篇的技術清單它幾乎全有，第 10 節「wavefront 能救回多少」也有人量過了。**Paul 動筆前應該先看一眼。**
- **會走動的動態場景**：erichlof 的 THREE.js-PathTracing-Renderer（2016 年起，手機上也能跑）、three-gpu-pathtracer（蒙皮、環境圖 MIS）、Rayzee（wavefront、兩層 BVH 加 refit、ASVGF）、Web-RTRT（ReSTIR 加 TLAS）。下篇作為「能力」不是新的。
- **講解型文章的缺口是真的，但窄。** Ciechanowski 的〈Lights and Shadows〉只講輻射度量，沒有蒙地卡羅。PBR 第四版（2023 起免費）、Scratchapixel、Bikker 的 BVH 系列都是靜態文字或 C++。James Randall 2026 年 3 月那篇有內嵌 WebGPU demo，但沒有 NEE、MIS、微表面。從 MIS 一路講到 SVGF、每個概念都有即時 demo 和量過的數字，中英文我都沒找到。
- **能說的差別**：每個數字都在讀者自己的分頁裡量；每個概念一個儀器；中英雙語。「第一個」不能說，建議寫成「截至 2026-09，我不知道有哪篇互動文章……」。
- **文獻修正兩處**：Narkowicz 的 ACES 擬合是 2016-01-06，不是 2015；改良版 ray cones 是 JCGT 10(1) 2021，不在 Ray Tracing Gems II。藍噪聲 2019 年其實是兩篇工作。其餘 DOI 都在報告的表 C。

## 4. Sketchbook（詳見 `research-sketchbook.md`）

- **「自有」不成立。** 作者是 swift502（Jan Blaha），MIT，2023 年封存。PSheon 沒有貢獻過，也沒有 fork。
- **world.glb 不能原樣放上來。** 它 26.4 MB，其中約 23 MB 是紋理；19 張內嵌圖片裡有 12 張是 `TexturesCom_*`。依 Textures.com 條款（Rev3-21），這些紋理不能以開源授權散佈，PBR 材質也不能和 3D 場景綁在一起發。可行的路：拿掉這些紋理，改用 CC0 或程序化材質，文中註明「島的幾何來自 Sketchbook（MIT），紋理已替換」；或者自己做一座島。（我不是律師，條款是現行版本。）
- **boxman.glb 和 car.glb 可以用（MIT）。** boxman 只有 186 個三角形、14 根骨頭、34 段動畫，拿來做蒙皮加 refit 正好。要附 MIT 全文和署名。
- **控制器比提案說的簡單。** Sketchbook 是 cannon 膠囊體，往下打一條光線，打到就直接把高度貼到地面（不是彈簧）；相機是沒有碰撞的軌道相機。用靜態 BLAS 做碰撞查詢是新寫的程式，不是移植。
- **島本身只有約 3 萬個三角形**，含碰撞體；碰撞體不要放進 BVH。對上面的實測來說很輕。

## 5. 和這個專案規矩的衝突

- **10 分鐘上限**（DESIGN.md「at most 10 minutes; 6–8 is the norm」）。上篇 13 節、11 個儀器，照過去每篇的密度估計在 25 分鐘以上。專案已經學過的原則是「一篇一個想法」「開場只做一件事」。
- **Paul 的口味**：前提要一句話就好玩，而且要先看到東西。「一張圖從雪花變清晰」有這個效果；「兩層 BVH」「光線錐」沒有。
- **數字要量過、要標出處。** 提案裡這些還是預估：「利用率 40–60%」、「NVIDIA / Intel 內顯」的數字（手邊沒有那兩種 GPU）、下篇的毫秒預算。
- **定位。** 首頁標題「從零實作機器學習模型」，定位意見書寫的真正差別是「在讀者分頁裡真的訓練」。這個系列沒有訓練。有一個自然的接點：**讓讀者在頁面裡訓練一個小降噪網路**（用 `lib/ml`），去對抗 1 spp 的雜訊，再和 SVGF 比。這樣第 8 節就變成這個站的招牌場景，而且 Lucida、erichlof 都沒有。
- **工時 32.5 天。** 過去每篇大約 1–3 天。

## 6. 建議（給 Paul 選）

**A. 照原提案兩篇，但各砍到 10 分鐘以內**：上篇 5 個儀器，下篇 5 個，其餘進附錄或變成續集。

**B. 拆成更多、更短的篇，每篇一個想法**（我推薦這個）：
1. 一張圖怎麼從雪花變清晰：渲染方程式、蒙地卡羅、1/√N、BVH 讓它跑得動（I1、I2、I4）
2. 少走冤枉路：NEE、MIS、cosine、雜訊的形狀（I5、I7；材質 I6 放這篇或第 1 篇）
3. 在分頁裡訓練一個降噪器 vs SVGF：回到站的主線（I8 加訓練）
4. 走進去：動態場景，也就是原下篇，換成自己的島或替換過紋理的島

**C. 只做上篇**，下篇等上篇發佈後再看要不要做。

不論選哪個，第一步都一樣：spike 已經證明引擎跑得動。接下來依 Paul 的習慣，先做一個「雪花變清晰」的可玩頁面給他看，再寫文字。

## 需要 Paul 決定

1. A / B / C？
2. 島：替換紋理後用 Sketchbook 的幾何，還是自己做一座？
3. 要不要加「在頁面裡訓練降噪器」，接回 ML 主線？
4. 引擎放在 `lib/rt/`（跨文章共用）還是 `content/posts/<slug>/components/`（跟過去的文章一樣）？
