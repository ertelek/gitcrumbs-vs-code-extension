import * as vscode from "vscode";
import { Cli } from "./cli";
import { Store } from "../state/store";
import type { ChildProcessWithoutNullStreams } from "child_process";

export class TrackRunner {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private emitter = new vscode.EventEmitter<boolean>();
  readonly onStateChanged = this.emitter.event;

  // Event for snapshot creation (used to refresh timeline)
  private snapshotEmitter = new vscode.EventEmitter<void>();
  readonly onSnapshotCreated = this.snapshotEmitter.event;

  public isRunning = false;

  constructor(private readonly cli: Cli, private readonly store: Store) {}

  start() {
    if (this.proc) return;
    const repo = this.store.repoPath();
    if (!repo) {
      vscode.window.showInformationMessage("Open a repository first.");
      return;
    }

    // Tracking mechanism: the CLI watches the filesystem for changes.
    const { snapshotAfter } = this.store.config();
    const args = ["track", "--snapshot-after", String(snapshotAfter)];

    this.proc = this.cli.runBackground(args, repo);
    this.isRunning = true;
    this.emitter.fire(true);

    // TODO: investigate why this isn't working.
    this.proc.stdout?.on("data", (d) => {
      const s = d.toString().trim();
      if (s) console.log(`[gitcrumbs track] ${s}`);
      if (s.includes("Snapshot created:")) {
        // Keep store revision in sync and notify listeners so the timeline refreshes
        this.store.bumpRevision();
        this.snapshotEmitter.fire();
      }
    });

    this.proc.stderr?.on("data", (d) =>
      console.warn(`[gitcrumbs track][stderr] ${d.toString().trim()}`)
    );

    this.proc.on("close", () => {
      this.proc = null;
      this.isRunning = false;
      this.emitter.fire(false);
    });
  }

  stop() {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
    this.isRunning = false;
    this.emitter.fire(false);
  }
}
