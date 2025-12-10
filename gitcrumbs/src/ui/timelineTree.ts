import * as vscode from "vscode";
import type { Store } from "../state/store";
import type { Cli } from "../infra/cli";

type SnapshotRow = {
  id: number;
  label: string | null;
  created_at: string; // "YYYY-MM-DD HH:MM:SS"
  branch: string | null;
  summary: string | null;
  restored_from_snapshot_id: number | null;
};

export class TimelineTreeView
  implements vscode.TreeDataProvider<TimelineItem | vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private snapshots: SnapshotRow[] = [];
  private currentId: number | null = null;

  constructor(private readonly store: Store, private readonly cli: Cli) {}

  async refresh() {
    try {
      const repo = this.store.repoPath();
      if (!repo) {
        this.snapshots = [];
        this.currentId = null;
        this._onDidChangeTreeData.fire();
        return;
      }

      // 1) Get timeline rows
      const timelineRes = await this.cli.run(["timeline"], repo);
      if (timelineRes.code !== 0) {
        this.snapshots = [];
        this.currentId = null;
        this._onDidChangeTreeData.fire();
        return;
      }
      this.snapshots = this.parseTimelineFromCli(timelineRes.stdout);

      // 2) Get current cursor snapshot id from `status`
      const statusRes = await this.cli.run(["status"], repo);
      this.currentId = this.parseCurrentIdFromStatus(statusRes.stdout);

      // NEWEST FIRST
      this.snapshots.sort((a, b) => b.id - a.id);
      this._onDidChangeTreeData.fire();
    } catch (e: any) {
      console.error("[gitcrumbs] timeline refresh failed:", e?.message || e);
      this.snapshots = [];
      this.currentId = null;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(el: TimelineItem): vscode.TreeItem {
    return el;
  }

  private getHeader() {
    const headerText = "Right-click a snapshot for options.";
    const header = new vscode.TreeItem(
      headerText,
      vscode.TreeItemCollapsibleState.None
    );
    header.contextValue = "gitcrumbs.timeline.header";

    return [header];
  }

  getChildren(): Promise<(TimelineItem | vscode.TreeItem)[]> {
    if (!this.snapshots.length) return Promise.resolve([]);
    const items = this.getHeader().concat(
      this.snapshots.map((s) => {
        const primary = s.label ?? `#${s.id}`; // label first, fallback to id

        const isCurrent = this.currentId !== null && s.id === this.currentId;
        const item = new TimelineItem(primary, s.id, s.label);

        // Icon: ✓ for current snapshot
        if (isCurrent) {
          item.iconPath = new vscode.ThemeIcon("check");
        }

        // Show created + branch in the description
        item.description = `${s.created_at} · ${s.branch ?? "?"}`;

        // Rich tooltip with full details (including label)
        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        md.appendMarkdown(
          [
            `**Snapshot: ${s.label ?? s.id}**${isCurrent ? " — _(current)_" : ""}`,
            s.label !== String(s.id) ? `**ID:** ${s.id}` : "",
            `**Created:** ${s.created_at}`,
            `**Branch:** ${s.branch ?? "?"}`,
            s.restored_from_snapshot_id
              ? `**Branched-off From:** #${s.restored_from_snapshot_id}`
              : "",
            s.summary ? `**Summary:** ${s.summary}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        item.tooltip = md;

        return item;
      })
    );
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
          s.trim().length ? undefined : "Enter an ID or label",
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

  async rename(item?: TimelineItem) {
    const repo = this.store.repoPath();
    if (!repo) return;

    let existingIdentifier: string | undefined;

    if (item) {
      // Prefer label if it exists, otherwise ID
      existingIdentifier = item.snapshotLabel ?? String(item.snapshotId);
    } else {
      // Fallback: ask the user which snapshot to rename (ID or label)
      const input = await vscode.window.showInputBox({
        prompt: "Snapshot ID or label to rename",
        placeHolder: "e.g. '3' or 'last working snapshot'",
      });
      if (!input) return;
      existingIdentifier = input.trim();
    }

    const newLabel = await vscode.window.showInputBox({
      prompt: "New snapshot label",
      placeHolder: "e.g. '3' or 'last working snapshot'",
      value: item?.snapshotLabel ?? "",
      validateInput: (val: string) =>
        val.trim().length === 0 ? "Label cannot be empty" : undefined,
    });

    if (!newLabel) return;

    const res = await this.cli.run(
      ["rename", existingIdentifier, newLabel.trim()],
      repo
    );

    if (res.code !== 0) {
      await this.cli.showError(res, "Failed to rename snapshot.");
      return;
    }

    vscode.window.showInformationMessage(
      `Gitcrumbs: Renamed snapshot ${existingIdentifier} to '${newLabel.trim()}'.`
    );
    await this.refresh();
  }

  // ---------- Parse helpers ----------
  private parseCurrentIdFromStatus(text: string): number | null {
    // Expect lines like: "Cursor snapshot id: 12"
    const m = text.match(/Cursor snapshot id:\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  private parseTimelineFromCli(text: string): SnapshotRow[] {
    const rows: SnapshotRow[] = [];

    // Keep only content lines that start with a vertical border (│ or |)
    const lines = text.split(/\r?\n/).filter((l) => /^\s*[│|]/.test(l));
    if (!lines.length) return rows;

    // #, Label, Created, Branch, Summary, Resumed-From
    const grab6 = (line: string): string[] | null => {
      const m = line.match(
        /^\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*(.*?)\s*[│|]\s*$/
      );
      return m ? m.slice(1).map((s) => s.trim()) : null;
    };

    type Building = {
      id: number;
      label?: string | null;
      createdDateTime?: string;
      branchParts: string[];
      summaryParts: string[];
      resumed?: number | null;
    };
    let cur: Building | null = null;

    const looksDateTime = (s: string) =>
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s);

    const flush = () => {
      if (!cur) return;
      const created_at = cur.createdDateTime ?? "";
      const branch = cur.branchParts.join(" ").trim() || null;
      const summary =
        cur.summaryParts.join(" ").replace(/\s+/g, " ").trim() || null;
      rows.push({
        id: cur.id,
        label: cur.label ?? null,
        created_at,
        branch,
        summary,
        restored_from_snapshot_id: cur.resumed ?? null,
      });
      cur = null;
    };

    for (const line of lines) {
      const cells = grab6(line);
      if (!cells) continue;
      const [c1, c2, c3, c4, c5, c6] = cells;

      if (/^\d+$/.test(c1)) {
        // New logical row
        flush();
        cur = {
          id: Number(c1),
          label: c2 || null,
          branchParts: [],
          summaryParts: [],
          resumed: null,
        };

        if (c3 && looksDateTime(c3)) {
          cur.createdDateTime = c3;
        } else if (c3) {
          // Be tolerant: store whatever we got
          cur.createdDateTime = c3;
        }

        if (c4) cur.branchParts.push(c4);
        if (c5) cur.summaryParts.push(c5);
        if (/^\d+$/.test(c6)) cur.resumed = Number(c6);
        continue;
      }

      // Continuation line (unlikely now, but keep it semi-robust)
      if (!cur) continue;
      if (c3 && !cur.createdDateTime) cur.createdDateTime = c3;
      if (c4) cur.branchParts.push(c4);
      if (c5) cur.summaryParts.push(c5);
      if (/^\d+$/.test(c6)) cur.resumed = Number(c6);
    }

    flush();
    return rows;
  }
}

export class TimelineItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly snapshotId: number,
    public readonly snapshotLabel: string | null
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gitcrumbs.timeline.item";
    this.tooltip = `Right-click for options`;
  }
}
