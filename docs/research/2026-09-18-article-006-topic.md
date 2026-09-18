# № 006 選題：三個候選的可行性

2026-09-18 · 研究 session（paul-d9）。№ 005（HydraNet）主 session 已經在寫，這份是下一篇。結論是建議，還沒有經過 Paul 確認。

> 更正（同日稍晚）：Paul 已確認寫 Lite3。下表有兩處錯，以 [2026-09-18-lite3-spike.md](2026-09-18-lite3-spike.md) 為準：機器人的 MJCF 不在 deploy repo，而在 submodule `deep_robotics_model`；「2185 個 STL、9 MB」是樓梯地形，機器人只有 4 個 STL、3.4 MB。policy 是 MLP 這一點已經打開檔案確認。

## 建議

**№ 006 寫 Lite3 機器狗走路（Act）。** MNIST 即時訓練不單獨成篇，改成 № 001 的升級。果蠅 connectome 排 № 007，先做資料 spike。

理由：

- 首頁的 See → Think → Act：005 上線後 See 有 2 篇、Think 1 篇、Act 2 篇，但 Act 兩篇都是 neuroevolution 玩具。再寫 MNIST 或果蠅就是連三篇視覺。
- 可行性比 roadmap 當時的假設好很多（下表），而且可以守住「從零寫」：官方 policy 是一個純 MLP，用 `lib/ml` 的 matmul 就能跑，不需要 onnxruntime-web。

## 查證過的事實

### Lite3（roadmap 4）

| 項目 | 結果 |
| --- | --- |
| repo | `DeepRoboticsLab/Lite3_rl_deploy`，BSD-3-Clause |
| policy | `policy/ppo/policy.onnx` 在 repo 裡，758 KB。輸入 `obs` 45 維，輸出 `actions` 12 維 |
| policy 結構 | 由檔案大小推算約 19 萬個 float32，符合 45→512→256→128→12 的 MLP。**這是推算，本機沒有 `onnx` 套件，還沒打開檔案確認** |
| 觀測 | 角速度 ×0.25、重力投影、指令、關節角、關節速度 ×0.05、上一次動作（見 `run_policy/lite3_test_policy_runner_onnx.hpp`） |
| 控制 | Kp 30、Kd 1、decimation 12、每個關節有 action scale |
| 機器人模型 | repo 已有 MJCF：`Lite3_description/lite3_mjcf/mjcf/scene.xml`，所以不需要 URDF → MJCF，也不需要 urdf-loader |
| 網格 | 2185 個 STL 共 9 MB，其中機身一個就 3 MB。要減面，或碰撞體用基本形狀、只留幾個外觀網格 |
| 物理引擎 | 官方 WASM 綁定已在 npm：`@mujoco/mujoco`（DeepMind 維護，ESM，附 TS 型別，單執行緒版不需要特殊 header） |

memory 裡寫的「URDF+STL via urdf-loader」可以作廢，直接用 MJCF。

不需要 GPU 就能做的互動：推它一把、改速度指令、改地面摩擦、改 Kp/Kd、在觀測上加雜訊或延遲（sim-to-real gap）、把某一組觀測歸零看它怎麼壞。需要 GPU 的（reward shaping 重新訓練）留到以後。

風險：WASM 檔案大小與手機效能沒量過；policy 的關節順序對應（`robot2policy_idx`）要照抄；MuJoCo 版本與 MJCF 的相容性要實際載入才知道。這些一個下午的 spike 可以回答。

### 果蠅 connectome（roadmap 3）

- 授權已確認：Janelia male CNS 與 optic lobe 都是 **CC-BY**，可由 neuPrint、Google bucket 整批下載。roadmap 上的「授權未確認」可以劃掉。
- 先例：Lappalainen et al. 2024（Nature）的 flyvis，MIT 授權，64 種細胞型、任務是 optic flow，和我們原本想的「運動方向」一致。
- 沒解決的：把 connectome 縮到瀏覽器能訓練的大小要自己設計（六角晶格、哪些細胞型、幾個 column）；60 秒內能不能長出方向選擇性完全未知。研究量最大，值得做，但不該是下一篇。

### MNIST 即時訓練（roadmap 2）

最便宜，conv backward 已經有了。但它和 № 001 講的是同一個模型，和 № 005 講的是同一件事（在瀏覽器裡訓練 CNN）。建議在 № 001 加一個「自己訓練」的儀器，不佔編號。

## 來源

- https://github.com/DeepRoboticsLab/Lite3_rl_deploy
- https://github.com/google-deepmind/mujoco/tree/main/wasm ；https://www.npmjs.com/package/@mujoco/mujoco
- https://male-cns.janelia.org/download/ ；https://www.janelia.org/project-team/flyem/male-cns-connectome
- https://github.com/TuragaLab/flyvis ；https://www.nature.com/articles/s41586-024-07939-3
