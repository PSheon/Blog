import json, sys, statistics as st
from collections import defaultdict
rows = defaultdict(list)
for line in open(sys.argv[1]):
    line = line.strip()
    if line: r = json.loads(line); rows[r["cfg"]].append(r)
keys = ["boxIoU", "sideErrPx", "maskIoU", "boxFromMaskIoU", "perSec"]
print(f"{'config':24} n  " + "  ".join(f"{k:>18}" for k in keys))
for cfg, rs in rows.items():
    cells = []
    for k in keys:
        v = [r[k] for r in rs]
        cells.append(f"{st.mean(v):8.3f} [{min(v):.3f},{max(v):.3f}]" if k != "perSec" else f"{st.mean(v):18.0f}")
    print(f"{cfg:24} {len(rs)}  " + "  ".join(f"{c:>18}" for c in cells))
print("params:", {c: rs[0]["params"] for c, rs in rows.items()})
print("ceiling, box from the ground-truth 16x16 mask:", rows[next(iter(rows))][0]["gtMask16BoxIoU"])
