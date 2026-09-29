import { execFileSync } from "node:child_process";

const base = process.env.TCE_DIFF_BASE || process.env.GITHUB_BASE_REF || "main";
let range = `${base}...HEAD`;
try {
  execFileSync("git", ["rev-parse", "--verify", base], { stdio: "ignore" });
} catch {
  range = "HEAD^...HEAD";
}

const files = execFileSync("git", ["diff", "--name-only", range], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const critical = {
  reception: ["src/app/ai-le-tan/", "src/components/ai-receptionist/", "src/server/ai-receptionist/"],
  business: ["src/app/business/"],
  marketing: ["src/app/marketing/", "src/server/marketing-command-center/", "src/server/marketing-manager/"],
  finance: ["src/app/finance/", "src/server/finance/"],
  personalFinance: ["src/app/personal-finance/"],
};

const touched = Object.entries(critical)
  .filter(([, prefixes]) => files.some((file) => prefixes.some((prefix) => file.startsWith(prefix))))
  .map(([key]) => key);

if (touched.length > 1) {
  console.error(`TCE Diff Gate FAIL: multiple critical modules changed in one PR: ${touched.join(", ")}`);
  console.error(files.join("\n"));
  process.exit(1);
}

const sharedHighRisk = [
  "src/components/tce/TceShell.tsx",
  "src/app/globals.css",
  "src/app/layout.tsx",
];
const sharedTouched = files.filter((file) => sharedHighRisk.includes(file));

if (sharedTouched.length && !files.includes("src/server/tce/global-safety.test.ts")) {
  console.error(
    `TCE Diff Gate FAIL: shared high-risk files changed without regression-test update: ${sharedTouched.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `TCE Diff Gate PASS: ${files.length} changed file(s); critical scope=${touched[0] ?? "none"}; sharedHighRisk=${sharedTouched.length}.`,
);
