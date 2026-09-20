"""Writes a checkpoint the page can load, and golden values that pin the TypeScript forward pass to this one.

    uv run --with torch --with numpy python scripts/train-vla/export.py --model run/model.pt --out public/vla/bc-v1 [--golden tests/fixtures/vla-golden.json --data /path/to/bc]

<out>.bin is every tensor as little-endian f32, one after another; <out>.json says where each one is, and how the model
was made. Golden: for a few (seed, step) pairs of the expert dataset, the logits of the first action token and the five
greedy tokens. The test regenerates the inputs from the seed in TypeScript, so only the outputs are stored.
"""
import argparse, json
from pathlib import Path
import numpy as np
import torch
from model import VLA, BINS, SLOTS
from train import load

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--golden"); ap.add_argument("--data"); ap.add_argument("--label", default="")
args = ap.parse_args()
checkpoint = torch.load(args.model, map_location="cpu"); made = checkpoint["args"]
model = VLA(made["frames"], made["d"], made["layers"], proprio=not made.get("no_proprio", False)); model.load_state_dict(checkpoint["state"]); model.eval()

tensors, offset, blob = [], 0, []
for name, value in model.state_dict().items():
    if name == "mask": continue
    flat = value.detach().float().contiguous().numpy().ravel().astype("<f4")
    tensors.append({"name": name, "shape": list(value.shape), "offset": offset}); offset += flat.size; blob.append(flat)
out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
out.with_suffix(".bin").write_bytes(np.concatenate(blob).tobytes())
out.with_suffix(".json").write_text(json.dumps({"label": args.label, "frames": made["frames"], "d": made["d"], "layers": made["layers"], "heads": 6, "steps": made["steps"], "seed": made["seed"], "floats": offset, "tensors": tensors}))
print(f"{offset} floats, {offset * 4 / 1e6:.2f} MB")

if args.golden:
    meta = json.loads((Path(args.data) / "meta.json").read_text())
    pixels, index, words, acts, feel, _ = load([args.data], made["frames"])
    starts, cases = np.cumsum([0] + [m["length"] for m in meta]), []
    for seed, t in [(1801, 0), (1801, 9), (1850, 14), (1900, 20), (1999, 5)]:
        k = next(i for i, m in enumerate(meta) if m["seed"] == seed); row = int(starts[k]) + min(t, meta[k]["length"] - 1)
        frames, w, a, f = torch.from_numpy(pixels[index[row]][None]), torch.from_numpy(words[row][None]), torch.from_numpy(acts[row][None]), torch.from_numpy(feel[row][None])
        with torch.no_grad():
            tokens, first = a[:, : -SLOTS].clone(), None
            for slot in range(SLOTS):
                logits = model(frames, w, torch.cat([tokens, torch.zeros(1, SLOTS - slot, dtype=torch.long)], 1), f)[0, slot]
                if slot == 0: first = logits.tolist()
                choice = int(logits[BINS:].argmax()) + BINS if slot == 4 else int(logits[:BINS].argmax())
                tokens = torch.cat([tokens, torch.tensor([[choice]])], 1)
        cases.append({"seed": seed, "step": min(t, meta[k]["length"] - 1), "logits": first, "tokens": tokens[0, -SLOTS:].tolist()})
    Path(args.golden).write_text(json.dumps({"checkpoint": out.name, "cases": cases}))
    print(f"{len(cases)} golden cases")
