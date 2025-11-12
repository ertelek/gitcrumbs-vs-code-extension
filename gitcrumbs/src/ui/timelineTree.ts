import * as vscode from "vscode";
import type { Store } from "../state/store";
import type { Cli } from "../infra/cli";

type SnapshotRow = {
  id: number;
  created_at: string; // "YYYY-MM-DD HH:MM:SS" if time present
  branch: string | null;
  summary: string | null;
  restored_from_snapshot_id: number | null;
};

export class TimelineTreeView implements vscode.TreeDataProvider<TimelineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private snapshots: SnapshotRow[] = [];

  constructor(private readonly store: Store, private readonly cli: Cli) {}

  async refresh() {
    try {
      const repo = this.store.repoPath();
      if (!repo) {
        this.snapshots = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      const res = await this.cli.run(["timeline"], repo); // Cli.run sets COLUMNS=10000 to avoid wrapping
      if (res.code !== 0) {
        this.snapshots = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      this.snapshots = this.parseTimelineFromCli(res.stdout);
      // NEWEST FIRST
      this.snapshots.sort((a, b) => b.id - a.id);
      this._onDidChangeTreeData.fire();
    } catch (e: any) {
      console.error("[gitcrumbs] timeline refresh failed:", e?.message || e);
      this.snapshots = [];
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(el: TimelineItem): vscode.TreeItem {
    return el;
  }

  getChildren(): Promise<TimelineItem[]> {
    if (!this.snapshots.length) return Promise.resolve([]);
    const items = this.snapshots.map((s) => {
      const label = `#${s.id}   ${s.created_at}  ${s.branch ?? "?"} — ${
        s.summary ?? ""
      }`.trim();
      return new TimelineItem(label, s.id);
    });
    return Promise.resolve(items);
  }

  async snapshotNow() {
    const repo = this.store.repoPath();
    if (!repo) return;
    const res = await this.cli.run(["snapshot"], repo);
    if (res.code !== 0) return;
    await this.refresh();
  }

  async restore(item?: TimelineItem) {
    const id =
      item?.snapshotId ??
      (await vscode.window.showInputBox({
        prompt: "Restore snapshot ID",
        validateInput: (s: string) =>
          /^\d+$/.test(s) ? undefined : "Enter a number",
      }));
    if (!id) return;
    const purge = vscode.workspace
      .getConfiguration("gitcrumbs")
      .get<boolean>("restore.purgeDefault", false);
    const repo = this.store.repoPath();
    if (!repo) return;
    const args = ["restore", String(id)].concat(
      purge ? ["--purge"] : ["--no-purge"]
    );
    const res = await this.cli.run(args, repo);
    if (res.code !== 0) return;
    await this.refresh();
  }

  async next() {
    const repo = this.store.repoPath();
    if (!repo) return;
    const r = await this.cli.run(["next"], repo);
    if (r.code !== 0) return;
    await this.refresh();
  }
  async previous() {
    const repo = this.store.repoPath();
    if (!repo) return;
    const r = await this.cli.run(["previous"], repo);
    if (r.code !== 0) return;
    await this.refresh();
  }

  // ---------- Robust parser for multi-line Rich table ----------
  private parseTimelineFromCli(text: string): SnapshotRow[] {
    const rows: SnapshotRow[] = [];

    // Keep only content lines that start with a vertical border (│ or |)
    const lines = text.split(/\r?\n/).filter((l) => /^\s*[│|]/.test(l));
    if (!lines.length) return rows;

    // Capture exactly 5 cells per visual line: ID, Created, Branch, Summary, Resumed-From
    const grab5 = (line: string): string[] | null => {
      const m = line.match(
        /^\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*$/
      );
      return m ? m.slice(1).map((s) => s.trim()) : null;
    };

    type Building = {
      id: number;
      createdDate?: string;
      createdTime?: string;
      branchParts: string[];
      summaryParts: string[];
      resumed?: number | null;
    };
    let cur: Building | null = null;

    const looksDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const looksTime = (s: string) => /^\d{2}:\d{2}:\d{2}$/.test(s);

    const flush = () => {
      if (!cur) return;
      const created_at = cur.createdDate
        ? cur.createdTime
          ? `${cur.createdDate} ${cur.createdTime}`
          : cur.createdDate
        : "";
      const branch = cur.branchParts.join(" ").trim() || null;
      const summary =
        cur.summaryParts.join(" ").replace(/\s+/g, " ").trim() || null;
      rows.push({
        id: cur.id,
        created_at,
        branch,
        summary,
        restored_from_snapshot_id: cur.resumed ?? null,
      });
      cur = null;
    };

    for (const line of lines) {
      const cells = grab5(line);
      if (!cells) continue;
      const [c1, c2, c3, c4, c5] = cells;

      if (/^\d+$/.test(c1)) {
        // New logical row
        flush();
        cur = {
          id: Number(c1),
          branchParts: [],
          summaryParts: [],
          resumed: null,
        };
        // Created column usually carries DATE on first visual line
        if (looksDate(c2)) cur.createdDate = c2;
        else if (looksTime(c2)) cur.createdTime = c2; // (edge case)
        // Branch may already have content on first line
        if (c3) cur.branchParts.push(c3);
        // Summary first fragment
        if (c4) cur.summaryParts.push(c4);
        // Resumed-From if present
        if (/^\d+$/.test(c5)) cur.resumed = Number(c5);
        continue;
      }

      // Continuation line for the current row
      if (!cur) continue;
      // Created column carries TIME on second line in your sample
      if (looksTime(c2)) cur.createdTime = c2;
      // Branch continuation (usually blank, but handle just in case)
      if (c3) cur.branchParts.push(c3);
      // Summary continuation
      if (c4) cur.summaryParts.push(c4);
      // Resumed-From can appear later (rare)
      if (/^\d+$/.test(c5)) cur.resumed = Number(c5);
    }

    flush();
    return rows;
  }
}

export class TimelineItem extends vscode.TreeItem {
  constructor(label: string, public readonly snapshotId: number) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gitcrumbs.timeline.item";
    this.tooltip = `Right-click for options`;
  }
}
