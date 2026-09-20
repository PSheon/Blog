# pcb-flip-vla — measurements

Machine: Apple M4 Pro, macOS 26.6.2, node v22.19.0, vitest 5. Scripts are the `.test.ts.txt` files here; each says how to run it.

## Stage 0.1 — the expert and the rasteriser (`expert-probe.test.ts.txt`)

```
slip 0: success 100.0%, mean steps 24.6, lost 0, timeout 0, events {"grasped":804,"placed":804}
slip 0.01: success 100.0%, mean steps 25.0, lost 0, timeout 0, events {"grasped":891,"placed":704,"slipped":187,"dropped":187}
slip 0.02: success 100.0%, mean steps 25.7, lost 0, timeout 0, events {"grasped":1000,"placed":628,"slipped":372,"dropped":372}
slip 0.05: success 98.9%, mean steps 27.9, lost 0, timeout 11, events {"grasped":1406,"slipped":1003,"dropped":1003,"placed":394}
slip 0.1: success 88.5%, mean steps 31.8, lost 0, timeout 115, events {"grasped":2470,"slipped":2229,"dropped":2229,"placed":179}
rasteriser: 6231 frames/s (48x48, 2x2 supersampled, one thread)
```

- The expert reads the true state and re-decides every step. Up to 2 % slip it never fails in 1000 episodes; at 10 % it runs out of its 80 steps in 11.5 % of them.
- A dropped board that was past a quarter turn lands the wanted way up, so some episodes finish through a drop: at 2 % slip, 804 episodes needed a grasp, all 804 succeeded, and only 628 ended with a placement — the other 176 ended with a lucky drop. Worth a sentence in the article.
- One instruction in five is already satisfied (804 of 1000 episodes involve a grasp at all).
- The rasteriser draws the 48 × 48 view at 6 200 frames a second on one thread; the plan needs about 4 000 to keep a GPU fed, so one worker is nearly enough and two are plenty.
