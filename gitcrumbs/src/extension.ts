import * as vscode from "vscode";
import { TrackRunner } from "./infra/trackRunner";
import { Cli } from "./infra/cli";
import { ActionsView } from "./ui/actionsView";
import { TimelineTreeView } from "./ui/timelineTree";
import { DiffTreeView } from "./ui/diffTree";
import { openFileSideBySide } from "./util/sideBySide";
import { Store } from "./state/store";
import { selectRepo } from "./util/selectRepo";

let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration("gitcrumbs");
  const cliPath = cfg.get<string>("path", "gitcrumbs");

  const store = new Store();
  const cli = new Cli(cliPath);
  const trackRunner = new TrackRunner(cli, store);
  const actionsView = new ActionsView();

  // Tree views
  const timelineView = new TimelineTreeView(store, cli);
  const diffView = new DiffTreeView(store, cli);

  disposables.push(
    vscode.window.registerTreeDataProvider("gitcrumbs.actions", actionsView),
    vscode.window.registerTreeDataProvider("gitcrumbs.timeline", timelineView),
    vscode.window.registerTreeDataProvider("gitcrumbs.diff", diffView)
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
    vscode.commands.registerCommand(
      "gitcrumbs.selectRepo",
      async () => await selectRepo(timelineView, trackRunner)
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

  // Expose simple context key for menus
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

  context.subscriptions.push(...disposables);
}

export function deactivate() {
  for (const d of disposables.splice(0)) {
    try {
      d.dispose();
    } catch {}
  }
}
