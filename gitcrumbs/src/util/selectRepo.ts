import * as vscode from "vscode";
import { TimelineTreeView } from "../ui/timelineTree";
import { TrackRunner } from "../infra/trackRunner";

export async function selectRepo(
  timelineView: TimelineTreeView,
  trackRunner: TrackRunner
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
      // ignore if path is invalid/missing
    }
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: "Select repository root",
    defaultUri, // will be omitted if undefined
  });

  if (!picked?.[0]) return;

  if (trackRunner.isRunning) {
    vscode.window.showInformationMessage("Stopping the Gitcrumbs tracker");
    trackRunner.stop();
  }

  await cfg.update(
    "repoPath",
    picked[0].fsPath,
    vscode.ConfigurationTarget.Workspace
  );
  timelineView.refresh();
}
