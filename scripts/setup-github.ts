/**
 * One-time (and after any Supabase key rotation) GitHub setup for the content
 * pipeline. Run by the owner — uses your `gh` login; values go straight from
 * your env files to GitHub and are never printed.
 *
 *   pnpm setup:github
 *
 * - Repo secrets STAGING_* from .env.local (the agent's staging access).
 * - Environment `content-production`: you must approve each run; deploys only
 *   from main. Its secrets PROD_* come from .env.production.local and are only
 *   readable by jobs in that environment, after approval.
 */

import { spawnSync } from "node:child_process";

import { isProd, loadProjectEnv, type ProjectEnv } from "./content/apply";

const REPO = "mdixondesigns/paskateparks";
const ENVIRONMENT = "content-production";

function gh(args: string[], input?: string): string {
  const r = spawnSync("gh", args, { input, encoding: "utf8", shell: false });
  if (r.status !== 0) {
    throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${r.stderr || r.error?.message}`);
  }
  return r.stdout.trim();
}

function setSecrets(prefix: string, env: ProjectEnv, extra: string[]) {
  const values: Record<string, string> = {
    [`${prefix}_DIRECT_URL`]: env.DIRECT_URL,
    [`${prefix}_SUPABASE_URL`]: env.NEXT_PUBLIC_SUPABASE_URL,
    [`${prefix}_SECRET_KEY`]: env.SUPABASE_SECRET_KEY,
  };
  for (const [name, value] of Object.entries(values)) {
    gh(["secret", "set", name, "--repo", REPO, ...extra], value);
    console.log(`  ✓ ${name}`);
  }
}

function main() {
  const staging = loadProjectEnv(".env.local");
  const prod = loadProjectEnv(".env.production.local");
  if (isProd(staging)) throw new Error(".env.local points at production — it must be staging.");
  if (!isProd(prod)) throw new Error(".env.production.local does not point at production.");

  const userId = Number(gh(["api", "user", "--jq", ".id"]));

  console.log(`Environment "${ENVIRONMENT}" (your approval required, main only):`);
  gh(
    ["api", "-X", "PUT", `repos/${REPO}/environments/${ENVIRONMENT}`, "--input", "-"],
    JSON.stringify({
      reviewers: [{ type: "User", id: userId }],
      prevent_self_review: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    }),
  );
  const policies = gh([
    "api",
    `repos/${REPO}/environments/${ENVIRONMENT}/deployment-branch-policies`,
    "--jq",
    "[.branch_policies[].name]",
  ]);
  if (!(JSON.parse(policies) as string[]).includes("main")) {
    gh([
      "api",
      "-X",
      "POST",
      `repos/${REPO}/environments/${ENVIRONMENT}/deployment-branch-policies`,
      "-f",
      "name=main",
      "-f",
      "type=branch",
    ]);
  }
  console.log("  ✓ created/updated");

  console.log("Repo secrets (staging, for the agent):");
  setSecrets("STAGING", staging, []);

  console.log(`Environment secrets (production, ${ENVIRONMENT} only):`);
  setSecrets("PROD", prod, ["--env", ENVIRONMENT]);

  console.log("Done.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
