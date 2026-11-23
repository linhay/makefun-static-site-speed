# makefun-static-site-speed

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/linhay/makefun-static-site-speed/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/linhay/makefun-static-site-speed/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

An optimized, dependency-free implementation of the makefun-site 1.0.0 interface for the static-site generator speed bounty. The reference code was released under MIT; the original license and upstream notices are retained. The entry compiles templates once per site, fuses Markdown block parsing and rendering, and reuses repeated fragments within a site.

## Run it

Requires Node.js 22.18 or later and the competition practice kit.

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=/path/to/kit/practice/input MAKEFUN_OUTPUT_DIR="$PWD/out" node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/) · Build a static site faster</sub>
