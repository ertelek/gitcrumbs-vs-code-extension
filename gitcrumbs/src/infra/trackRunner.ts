// infra/trackRunner.ts
import * as vscode from "vscode";
import { Cli } from "./cli";
import { Store } from "../state/store";
import type { ChildProcessWithoutNullStreams } from "child_process";

export class TrackRunner {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private emitter = new vscode.EventEmitter<boolean>();
  readonly onStateChanged = this.emitter.event;

  // NEW: event for snapshot creation
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

    const { scanInterval, snapshotAfter } = this.store.config();
    const args = [
      "track",
      "--scan-interval",
      String(scanInterval),
      "--snapshot-after",
      String(snapshotAfter),
    ];
    this.proc = this.cli.runBackground(args, repo);
    this.isRunning = true;
    this.emitter.fire(true);

    // TODO: investigate why this isn't working.
    this.proc.stdout?.on("data", (d) => {
      const s = d.toString().trim();
      if (s) console.log(`[gitcrumbs track] ${s}`);
      if (s.includes("Snapshot created:")) {
        this.store.bumpRevision();
        // NEW: notify listeners (Timeline will refresh)
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
