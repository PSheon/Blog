"""Behaviour cloning on trajectories exported from the TypeScript world (docs/research/pcb-flip-vla/export-bc.test.ts.txt).

    uv run --with torch --with numpy python scripts/train-vla/train.py --data /path/to/bc --out /path/to/run [--frames 4] [--steps 3000]
"""
import argparse, json, time
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from model import VLA, BINS, HISTORY, SLOTS, IMAGE

STILL = (BINS - 1) // 2


def tokens(action):  # four bins, then open/closed moved past the bins
    return action[:4] + [BINS + action[4]]


def load(dirs, frames):
    """Several datasets (expert data, then each DAgger round) read as one. Returns the held-out count too: the last tenth
    of the FIRST dataset's trajectories, which no run ever trains on."""
    pixels, index, words, acts, feel, held, offset = [], [], [], [], [], 0, 0
    for n, data in enumerate(dirs):
        meta = json.loads((Path(data) / "meta.json").read_text())
        frames_here = np.memmap(Path(data) / "frames.u8", dtype=np.uint8, mode="r").reshape(-1, IMAGE, IMAGE, 3)
        pixels.append(frames_here)
        order = meta if n else meta[: len(meta) - len(meta) // 10] + meta[len(meta) - len(meta) // 10:]
        for k, m in enumerate(order):
            for t in range(m["length"]):
                index.append([offset + m["start"] + max(0, t - f) for f in range(frames - 1, -1, -1)])
                history = [tokens(m["taken"][t - h]) if t - h >= 0 else [STILL] * 4 + [BINS] for h in range(HISTORY, 0, -1)]
                acts.append(sum(history, []) + tokens(m["labels"][t])); words.append(m["instruction"]); feel.append(m["proprio"][t])
            if n == 0 and k >= len(meta) - len(meta) // 10: held += m["length"]
        offset += len(frames_here)
    index, words, acts, feel = np.array(index), np.array(words), np.array(acts), np.array(feel, dtype=np.float32)
    if len(dirs) > 1:  # move the held-out block (the tail of dataset 0) to the very end
        first = sum(m["length"] for m in json.loads((Path(dirs[0]) / "meta.json").read_text()))
        order = np.concatenate([np.arange(0, first - held), np.arange(first, len(index)), np.arange(first - held, first)])
        index, words, acts, feel = index[order], words[order], acts[order], feel[order]
    return np.concatenate(pixels) if len(pixels) > 1 else pixels[0], index, words, acts, feel, held


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="one directory, or several separated by commas"); ap.add_argument("--out", required=True)
    ap.add_argument("--init", help="start from this checkpoint (DAgger rounds)"); ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--frames", type=int, default=4); ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=128); ap.add_argument("--d", type=int, default=96); ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1); ap.add_argument("--no-proprio", action="store_true")
    args = ap.parse_args()
    torch.manual_seed(args.seed); rng = np.random.default_rng(args.seed)
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    pixels, index, words, acts, feel, held = load(args.data.split(","), args.frames)
    train = len(index) - held
    model = VLA(args.frames, args.d, args.layers, proprio=not args.no_proprio).to(device)
    if args.init: model.load_state_dict(torch.load(args.init, map_location="cpu")["state"])
    print(f"{sum(p.numel() for p in model.parameters())} parameters, {train} training samples, {held} held out, {device}")
    optimiser = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimiser, max_lr=args.lr, total_steps=args.steps, pct_start=0.05)

    def batch(ids):
        ids = np.sort(ids)
        return (torch.from_numpy(pixels[index[ids]]).to(device), torch.from_numpy(words[ids]).to(device), torch.from_numpy(acts[ids]).to(device), torch.from_numpy(feel[ids]).to(device))

    started = time.time()
    for step in range(1, args.steps + 1):
        frames, w, a, f = batch(rng.integers(0, train, args.batch))
        loss = F.cross_entropy(model(frames, w, a, f).flatten(0, 1), a[:, -SLOTS:].flatten())
        optimiser.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimiser.step(); schedule.step()
        if step % 1000 == 0 or step == args.steps:
            model.eval(); right = torch.zeros(SLOTS); seen = 0
            with torch.no_grad():
                for start in range(train, len(index), 512):
                    frames, w, a, f = batch(np.arange(start, min(len(index), start + 512)))
                    right += (model(frames, w, a, f).argmax(-1) == a[:, -SLOTS:]).float().sum(0).cpu(); seen += len(a)
            model.train()
            print(f"step {step}: loss {loss.item():.3f}, held-out accuracy yaw/shoulder/elbow/roll/grip {' '.join(f'{v:.3f}' for v in (right / seen).tolist())}, {time.time() - started:.0f} s", flush=True)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    torch.save({"state": model.state_dict(), "args": vars(args)}, out / "model.pt")


if __name__ == "__main__":
    main()
