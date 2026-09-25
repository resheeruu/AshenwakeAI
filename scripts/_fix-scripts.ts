import fs from "node:fs";
const files = [
  "scripts/failover.sh","scripts/failover-run.sh","scripts/auto-sync.sh",
  "scripts/deploy-update.sh","scripts/ashennai-control.sh","scripts/deploy-all.sh",
  "scripts/ashennai-supervisor.sh","scripts/anomaly-monitor.sh"
];
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  s = s.replace(/#!/data/data/com.termux/files/usr/bin/bash/g, "#!/usr/bin/env bash");
  const repl = `PROJECT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"`;
  s = s.replace(/PROJECT_DIR="\$HOME\/AshenAI"/g, repl);
  fs.writeFileSync(f, s);
  console.log(f, "updated");
}
