import * as vscode from "vscode";
import * as path from "path";
import { TimelineTreeView } from "../ui/timelineTree";
import { TrackRunner } from "../infra/trackRunner";
import { Cli } from "../infra/cli";
import { ActionsView } from "../ui/actionsView";
import { Store } from "../state/store";

/**
 * Get a human-friendly name for a repo path (just the folder name).
 */
export function repoDisplayName(repoPath: string): string {
  if (!repoPath) return "(unknown repo)";
  return path.basename(repoPath);
}

/**
 * Check if the given path is inside a Git repository.
 */
export async function isGitRepo(fsPath: string): Promise<boolean> {
  if (!fsPath) return false;
  const res = await Cli.runRaw(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    fsPath
  );
  return res.code === 0 && /true/i.test(res.stdout.trim());
}

/**
 * Check if gitcrumbs has been initialised in this repo.
 * (We consider "status" returning exit code 0 as "initialised".)
 */
export async function isGitcrumbsInitialised(
  cli: Cli,
  fsPath: string
): Promise<boolean> {
  const res = await cli.run(["status"], fsPath);
  return res.code === 0;
}

/**
 * Common helper to ask whether to start tracking for a repo,
 * and start the TrackRunner if the user confirms.
 *
 * Behaviour with preferences:
 *  - If repo is marked "auto"  → start tracking without asking.
 *  - If repo is marked "never" → do nothing and do not ask.
 *  - If no preference          → show prompt and remember answer.
 */
export async function askToStartTrackingForRepo(
  trackRunner: TrackRunner,
  store: Store,
  repoPath: string
): Promise<void> {
  const repoName = repoDisplayName(repoPath);
  const repoId = store.repoIdForPath(repoPath);

  const existing = store.getTrackingPreference(repoId);
  if (existing === "auto") {
    // Already opted-in for this repo → auto-start
    trackRunner.start();
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Gitcrumbs initialised for repository ${repoName}. Start tracking now?`,
    "Yes",
    "No"
  );
  if (choice === "Yes") {
    await store.setTrackingPreference(repoId, "auto");
    trackRunner.start();
  } else if (choice === "No") {
    await store.setTrackingPreference(repoId, "never");
  }
}

export async function selectRepo(
  timelineView: TimelineTreeView,
  trackRunner: TrackRunner,
  cli: Cli,
  actionsView: ActionsView,
  store: Store
) {
  const cfg = vscode.workspace.getConfiguration("gitcrumbs");
  const saved = cfg.get<string>("repoPath");

  // Only set defaultUri if we have a valid existing path
  let defaultUri: vscode.Uri | undefined = undefined;
  if (saved) {
    const uri = vscode.Uri.file(saved);
    try {
      await vscode.workspace.fs.stat(uri); // throws if missing
      defaultUri = uri;
    } catch {
      vscode.window.showErrorMessage(
        "Gitcrumbs: Saved repository path is invalid, please choose another folder."
      );
    }
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: "Select repository root",
    defaultUri,
  });

  if (!picked?.[0]) return;

  const repoPath = picked[0].fsPath;
  const repoName = repoDisplayName(repoPath);

  if (trackRunner.isRunning) {
    vscode.window.showInformationMessage(
      `Gitcrumbs: Stopping the tracker before switching to ${repoName}.`
    );
    trackRunner.stop();
  }

  // Save immediately (so future open dialog defaults to this path)
  await cfg.update("repoPath", repoPath, vscode.ConfigurationTarget.Workspace);
  actionsView.refresh(); // update the "Repository: ..." label

  // Branch 1: Not a Git repo → ask to init Git, then init gitcrumbs, then ask to start tracking
  if (!(await isGitRepo(repoPath))) {
    const answer = await vscode.window.showInformationMessage(
      `${repoName} is not currently a Git repository. Do you want to initialise a Git repo here?`,
      "Yes",
      "No"
    );
    if (answer === "Yes") {
      const initGit = await Cli.runRaw("git", ["init"], repoPath);
      if (initGit.code !== 0) {
        await vscode.window.showErrorMessage(
          `Gitcrumbs: Failed to run "git init" in ${repoName}.`
        );
        // Still refresh to reflect the selection, but nothing more.
        await timelineView.refresh();
        actionsView.refresh();
        return;
      }
      const initGc = await cli.run(["init"], repoPath);
      if (initGc.code !== 0) {
        await cli.showError(
          initGc,
          `Failed to initialise gitcrumbs in repository ${repoName}.`
        );
        await timelineView.refresh();
        actionsView.refresh();
        return;
      }

      // Git + gitcrumbs initialised successfully → ask/start according to preference
      await askToStartTrackingForRepo(trackRunner, store, repoPath);
    }

    await timelineView.refresh();
    actionsView.refresh();
    return;
  }

  // Branch 2: Is a Git repo → if gitcrumbs not initialised, auto-init,
  // then ask/start tracking (shared helper).
  const initialised = await isGitcrumbsInitialised(cli, repoPath);
  if (!initialised) {
    const initGc = await cli.run(["init"], repoPath);
    if (initGc.code !== 0) {
      await cli.showError(
        initGc,
        `Failed to initialise gitcrumbs in repository ${repoName}.`
      );
      await timelineView.refresh();
      actionsView.refresh();
      return;
    }
  }

  // In both cases (already initialised or newly initialised),
  // ask/auto-start depending on existing preference.
  await askToStartTrackingForRepo(trackRunner, store, repoPath);

  await timelineView.refresh();
  actionsView.refresh();
}
