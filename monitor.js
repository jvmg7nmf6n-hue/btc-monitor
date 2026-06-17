name: BTC Monitor
on:
  schedule:
    - cron: '*/15 * * * *'   # har ~15 min (GitHub thoda late kar sakta hai)
  workflow_dispatch:          # "Run workflow" button se manual test
permissions:
  contents: write             # state.json save karne ke liye
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node monitor.js
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
      - name: Save state
        run: |
          git config user.name "btc-monitor"
          git config user.email "actions@users.noreply.github.com"
          git add state.json
          git commit -m "state update" || echo "no changes"
          git push || echo "nothing to push"
