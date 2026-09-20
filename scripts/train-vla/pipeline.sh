#!/bin/sh
# The four recipes of the article, end to end. Data and checkpoints go to $1 (outside the repo); about an hour on an M4 Pro.
#   sh scripts/train-vla/pipeline.sh /path/to/work
set -e
W="$1"; R=docs/research/pcb-flip-vla; T=tests/vla
collect() { cp $R/export-bc.test.ts.txt $T/export-bc.test.ts; env "$@" pnpm exec vitest run $T/export-bc.test.ts --disable-console-intercept 2>&1 | grep -E "^wrote|Error" ; rm -f $T/export-bc.test.ts; }
train() { (cd scripts/train-vla && uv run --with torch --with numpy python train.py "$@" 2>&1 | grep -E "parameters|^step") ; }
round() { cp $R/dagger-round.test.ts.txt $T/dagger-round.test.ts; env "$@" pnpm exec vitest run $T/dagger-round.test.ts --disable-console-intercept 2>&1 | grep -E "^round|Error"; rm -f $T/dagger-round.test.ts; }

[ -d "$W/bc" ]   || collect VLA_OUT="$W/bc" VLA_N=2000
[ -d "$W/dart" ] || collect VLA_OUT="$W/dart" VLA_N=2000 VLA_MODE=dart VLA_NOISE=0.15
[ -d "$W/bc-cam" ] || collect VLA_OUT="$W/bc-cam" VLA_N=2000 VLA_CAMRAND=1
[ -f "$W/run-bc/model.pt" ]   || train --data "$W/bc" --out "$W/run-bc" --steps 3000
[ -f "$W/run-dart/model.pt" ] || train --data "$W/dart" --out "$W/run-dart" --steps 3000
[ -f "$W/run-bc-cam/model.pt" ] || train --data "$W/bc-cam" --out "$W/run-bc-cam" --steps 3000

# DAgger: five rounds of 500 episodes on fresh seeds; each round's data joins all the earlier data and training carries on.
dagger() { name="$1"; base="$2"; cam="$3"; prev="$W/run-$base/model.pt"; data="$W/$base"; k=1
  for beta in 0.5 0.3 0.2 0.1 0; do
    [ -d "$W/$name-r$k" ] || round VLA_MODEL="$prev" VLA_OUT="$W/$name-r$k" VLA_SEED0=$((200000 + k * 1000)) VLA_N=500 VLA_BETA=$beta $cam
    data="$data,$W/$name-r$k"
    [ -f "$W/run-$name-r$k/model.pt" ] || train --data "$data" --out "$W/run-$name-r$k" --init "$prev" --steps 1500 --lr 5e-4
    prev="$W/run-$name-r$k/model.pt"; k=$((k + 1))
  done; }
dagger dagger bc ""
dagger dagger-cam bc-cam VLA_CAMRAND=1
