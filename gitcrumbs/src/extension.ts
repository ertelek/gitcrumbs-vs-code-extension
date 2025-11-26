import * as vscode from "vscode";
import { TrackRunner } from "./infra/trackRunner";
import { Cli } from "./infra/cli";
import { ActionsView } from "./ui/actionsView";
import { TimelineTreeView } from "./ui/timelineTree";
import { DiffTreeView } from "./ui/diffTree";
import { TrackingView } from "./ui/trackingView";
import { openFileSideBySide } from "./util/sideBySide";
import { Store } from "./state/store";
import { selectRepo } from "./util/selectRepo";

let disposables: vscode.Disposable[] = [];

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

async function maybeAutoInitGitcrumbsOnLoad(
  cli: Cli,
  trackRunner: TrackRunner,
  repoPath: string
) {
  // only if already a Git repo; do nothing else if not a git repo
  if (!(await isGitRepo(repoPath))) {
    vscode.window.showInformationMessage(
      "Gitcrumbs: You’re not in a Git repository."
    );
    return;
  }

  // If git repo but gc not initialised -> init automatically, then ask to start tracking
  const initialised = await isGitcrumbsInitialised(cli, repoPath);

  if (!initialised) {
    const initRes = await cli.run(["init"], repoPath);
    if (initRes.code !== 0) {
      await cli.showError(
        initRes,
        "Failed to initialise gitcrumbs in this repository."
      );
      return;
    }
  }

  const choice = await vscode.window.showInformationMessage(
    "Gitcrumbs initialised for this repository. Start tracking now?",
    "Yes",
    "No"
  );
  if (choice === "Yes") {
    trackRunner.start();
  }
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gitcrumbs");
  const cliPath = cfg.get<string>("path", "gitcrumbs");

  const store = new Store();
  const cli = new Cli(cliPath);
  const trackRunner = new TrackRunner(cli, store);

  trackRunner.onSnapshotCreated(() => {
    timelineView.refresh();
  });

  // Tree views
  const actionsView = new ActionsView();
  const timelineView = new TimelineTreeView(store, cli);
  const diffView = new DiffTreeView(store, cli);
  const trackingView = new TrackingView();

  disposables.push(
    vscode.window.registerTreeDataProvider("gitcrumbs.actions", actionsView),
    vscode.window.registerTreeDataProvider("gitcrumbs.timeline", timelineView),
    vscode.window.registerTreeDataProvider("gitcrumbs.diff", diffView),
    vscode.window.registerTreeDataProvider("gitcrumbs.tracking", trackingView)
  );

  // Commands
  disposables.push(
    vscode.commands.registerCommand("gitcrumbs.startTracking", () =>
      trackRunner.start()
    ),
    vscode.commands.registerCommand("gitcrumbs.stopTracking", () =>
      trackRunner.stop()
    ),
    vscode.commands.registerCommand("gitcrumbs.snapshotNow", () =>
      timelineView.snapshotNow()
    ),
    vscode.commands.registerCommand("gitcrumbs.restore", (item: unknown) =>
      timelineView.restore(item as any)
    ),
    vscode.commands.registerCommand("gitcrumbs.next", () =>
      timelineView.next()
    ),
    vscode.commands.registerCommand("gitcrumbs.previous", () =>
      timelineView.previous()
    ),
    vscode.commands.registerCommand("gitcrumbs.setSnapshotA", (item: unknown) =>
      diffView.setA(item as any)
    ),
    vscode.commands.registerCommand("gitcrumbs.setSnapshotB", (item: unknown) =>
      diffView.setB(item as any)
    ),
    vscode.commands.registerCommand("gitcrumbs.clearSelection", () =>
      diffView.clearSelection()
    ),
    vscode.commands.registerCommand("gitcrumbs.openDiff", (item: unknown) =>
      diffView.openDiff(item as any)
    ),
    // UPDATED: pass cli into selectRepo
    vscode.commands.registerCommand(
      "gitcrumbs.selectRepo",
      async () => await selectRepo(timelineView, trackRunner, cli)
    ),
    vscode.commands.registerCommand("gitcrumbs.refreshTimeline", () =>
      timelineView.refresh()
    ),
    vscode.commands.registerCommand(
      "gitcrumbs.openFileSideBySide",
      async (relPathOrItem: unknown, a?: number, b?: number) => {
        await openFileSideBySide(relPathOrItem, a, b, {
          cli,
          store,
          getPair: () => (diffView as any).pair as { a?: number; b?: number },
        });
      }
    )
  );

  // Status bar
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  status.text = "Gitcrumbs: ○ Stopped";
  status.command = "gitcrumbs.startTracking";
  status.tooltip = "Start gitcrumbs tracking";
  status.show();
  disposables.push(status);

  const setCtx = (k: string, v: any) =>
    vscode.commands.executeCommand("setContext", k, v);
  trackRunner.onStateChanged((running: boolean) => {
    status.text = running ? "Gitcrumbs: ● Tracking" : "Gitcrumbs: ○ Stopped";
    status.command = running
      ? "gitcrumbs.stopTracking"
      : "gitcrumbs.startTracking";
    setCtx("gitcrumbs.isTracking", running);
  });

  // Initial refresh
  timelineView.refresh();
  diffView.refresh();

  // -------- startup checks --------
  const cwdForChecks =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  if (!Cli.commandExists("git", cwdForChecks)) {
    vscode.window.showErrorMessage(
      "Gitcrumbs: Git is not installed or not found on PATH. Please install Git and reload."
    );
    context.subscriptions.push(...disposables);
    return;
  }

  if (!Cli.commandExists(cli.bin, cwdForChecks)) {
    vscode.window.showErrorMessage(
      "Gitcrumbs: The gitcrumbs CLI is not installed or not found on PATH. Please install gitcrumbs and reload."
    );
    context.subscriptions.push(...disposables);
    return;
  }

  // -------- gitcrumbs version check on first load --------
  try {
    const version = await cli.getVersion(cwdForChecks);
    if (version !== null) {
      (store as any).gitcrumbsVersion = version;
      (store as any).gitcrumbsVersionMatches =
        version === store.requiredGitcrumbsVersion;

      if (version !== store.requiredGitcrumbsVersion) {
        vscode.window.showWarningMessage(
          `Gitcrumbs: Please update your gitcrumbs CLI to version ${store.requiredGitcrumbsVersion} (found ${version}). If you installed it with pipx, run 'pipx upgrade gitcrumbs'.`,
        );
      }
    }
    // If version is null, we assume an older CLI without -V support and stay quiet.
  } catch (err) {
    // Non-fatal: just log to output channel
    const ch = vscode.window.createOutputChannel("Gitcrumbs");
    ch.appendLine(
      `[gitcrumbs] Failed to determine gitcrumbs CLI version: ${String(err)}`
    );
  }

  const repoPath = store.repoPath?.() ?? ""; // Store has repoPath()
  if (repoPath) {
    // On load: if not a Git repo -> show message and do nothing else (per requirement)
    // If is a Git repo but gitcrumbs not initialised -> auto-init then prompt to start tracking.
    maybeAutoInitGitcrumbsOnLoad(cli, trackRunner, repoPath);
  }

  context.subscriptions.push(...disposables);
}

export function deactivate() {
  for (const d of disposables.splice(0)) {
    try {
      d.dispose();
    } catch {}
  }
}
