// src/utils/sideBySide.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { Cli } from "../infra/cli";
import type { Store } from "../state/store";

/** Robustly extract a repo-relative path from string, TreeItem, or our FileItem */
function coerceRelPath(input: unknown): string | null {
  if (typeof input === "string") return input;
  const anyInput = input as any;
  if (anyInput?.relPath && typeof anyInput.relPath === "string") return anyInput.relPath; // our FileItem
  if (anyInput?.label) {
    if (typeof anyInput.label === "string") return anyInput.label;
    if (typeof anyInput.label?.label === "string") return anyInput.label.label;
  }
  return null;
}

function sanitizeRel(rel: string): string {
  // keep structure but strip illegal filename chars
  return rel.replace(/[:*?"<>|]/g, "_");
}

/** Write two temp files under .git/gitcrumbs/vscode-diffs and return their paths */
async function writeTempPairFromCli(cli: Cli, repoRoot: string, a: number, b: number, relPath: string) {
  const gitDir = path.join(repoRoot, ".git", "gitcrumbs");
  const baseDir = path.join(gitDir, "vscode-diffs", `${a}-${b}`);
  const sanitized = sanitizeRel(relPath);
  const leftFile  = path.join(baseDir, `${sanitized}.left`);
  const rightFile = path.join(baseDir, `${sanitized}.right`);
  fs.mkdirSync(path.dirname(leftFile), { recursive: true });

  // Ask CLI for raw bytes of the file at each snapshot
  const [A, B] = await Promise.all([
    cli.run(["show-file", String(a), relPath], repoRoot),
    cli.run(["show-file", String(b), relPath], repoRoot),
  ]);

  // Be lenient: if CLI fails, write empty content so diff still opens (useful for add/delete)
  fs.writeFileSync(leftFile,  A.code === 0 ? A.stdout : "", "utf8");
  fs.writeFileSync(rightFile, B.code === 0 ? B.stdout : "", "utf8");

  return { leftFile, rightFile };
}

/**
 * Open VS Code’s native side-by-side diff for file relPath between snapshots A and B.
 * If A/B are not provided, it calls getPair() to reuse the Diff view’s current selection.
 */
export async function openFileSideBySide(
  relPathOrItem: unknown,
  a: number | undefined,
  b: number | undefined,
  deps: { cli: Cli; store: Store; getPair: () => { a?: number; b?: number } }
) {
  const repo = deps.store.repoPath();
  if (!repo) return;

  const relPath = coerceRelPath(relPathOrItem);
  if (!relPath) {
    vscode.window.showErrorMessage("Could not determine file path to diff.");
    return;
  }

  const pair = typeof a === "number" && typeof b === "number" ? { a, b } : deps.getPair();
  if (!pair?.a || !pair?.b) {
    vscode.window.showInformationMessage("Select Snapshot A and B first.");
    return;
  }

  const { leftFile, rightFile } = await writeTempPairFromCli(deps.cli, repo, pair.a, pair.b, relPath);

  const leftUri  = vscode.Uri.file(leftFile);
  const rightUri = vscode.Uri.file(rightFile);
  const title = `${relPath} (A:${pair.a} ↔ B:${pair.b})`;
  await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
}
