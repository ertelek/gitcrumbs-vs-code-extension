import * as vscode from "vscode";
import { TimelineTreeView } from "../ui/timelineTree";
import { TrackRunner } from "../infra/trackRunner";
import { Cli } from "../infra/cli";

async function isGitRepo(path: string): Promise<boolean> {
  if (!path) return false;
  const res = await Cli.runRaw(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    path
  );
  return res.code === 0 && /true/i.test(res.stdout.trim());
}

async function isGitcrumbsInitialised(
  cli: Cli,
  path: string
): Promise<boolean> {
  const res = await cli.run(["status"], path);
  return res.code === 0;
}

export async function selectRepo(
  timelineView: TimelineTreeView,
  trackRunner: TrackRunner,
  cli: Cli
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
      vscode.window.showErrorMessage("Invalid path, please try again.");
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

  if (trackRunner.isRunning) {
    vscode.window.showInformationMessage("Stopping the Gitcrumbs tracker");
    trackRunner.stop();
  }

  const repoPath = picked[0].fsPath;

  // Save immediately (so future open dialog defaults to this path)
  await cfg.update("repoPath", repoPath, vscode.ConfigurationTarget.Workspace);

  // Branch 1: Not a Git repo → ask to init Git, then init gitcrumbs, then ask to start tracking
  if (!(await isGitRepo(repoPath))) {
    const answer = await vscode.window.showInformationMessage(
      "You are not in a Git repo. Do you want to initialise a repository here?",
      "Yes",
      "No"
    );
    if (answer === "Yes") {
      const initGit = await Cli.runRaw("git", ["init"], repoPath);
      if (initGit.code !== 0) {
        await vscode.window.showErrorMessage(
          "Failed to run `git init` in this folder."
        );
        // Still refresh to reflect the selection, but nothing more.
        await timelineView.refresh();
        return;
      }
      const initGc = await cli.run(["init"], repoPath);
      if (initGc.code !== 0) {
        await cli.showError(
          initGc,
          "Failed to initialise gitcrumbs in this repository."
        );
        await timelineView.refresh();
        return;
      }
      const start = await vscode.window.showInformationMessage(
        "Repository initialised. Start Gitcrumbs tracking now?",
        "Yes",
        "No"
      );
      if (start === "Yes") {
        await trackRunner.start();
      }
    }
    await timelineView.refresh();
    return;
  }

  // Branch 2: Is a Git repo → if gitcrumbs not initialised, auto-init, then ask to start tracking
  const initialised = await isGitcrumbsInitialised(cli, repoPath);
  if (!initialised) {
    const initGc = await cli.run(["init"], repoPath);
    if (initGc.code !== 0) {
      await cli.showError(
        initGc,
        "Failed to initialise gitcrumbs in this repository."
      );
      await timelineView.refresh();
      return;
    }
  }

  const start = await vscode.window.showInformationMessage(
    "Gitcrumbs initialised for this repository. Start tracking now?",
    "Yes",
    "No"
  );
  if (start === "Yes") {
    trackRunner.start();
  }

  await timelineView.refresh();
}
