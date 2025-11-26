import * as vscode from "vscode";
import * as path from "path";

import type { Store } from "../state/store";
import type { Cli } from "../infra/cli";

type Kind = "A" | "M" | "D";
type Change = { path: string; kind: Kind };

export class DiffTreeView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private a?: number;
  private b?: number;
  private changes: Change[] = [];
  private loading = false;
  private loadKey: string | null = null;

  constructor(private readonly store: Store, private readonly cli: Cli) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  private coerceId(item: unknown): number | undefined {
    if (item == null) return undefined;
    const anyItem = item as any;
    if (typeof anyItem.snapshotId === "number") return anyItem.snapshotId;
    if (typeof anyItem.id === "number") return anyItem.id;
    if (typeof item === "number") return item as number;
    return undefined;
  }

  setA(item?: unknown) {
    this.a = this.coerceId(item);
    void this.reload();
  }

  setB(item?: unknown) {
    this.b = this.coerceId(item);
    void this.reload();
  }

  clearSelection() {
    this.a = undefined;
    this.b = undefined;
    this.changes = [];
    this.loadKey = null;
    this.loading = false;
    this.refresh();
  }

  // Toolbar helper (QuickPick to choose a file and open side-by-side diff)
  async openDiff(_item?: vscode.TreeItem) {
    if (!this.a || !this.b) {
      vscode.window.showInformationMessage("Select Snapshot A and B first.");
      return;
    }
    if (!this.changes.length && !this.loading) await this.reload();
    if (!this.changes.length) {
      vscode.window.showInformationMessage(
        `No differences between snapshots ${this.a} and ${this.b}.`
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      this.changes.map((c) => ({
        label: c.path,
        description:
          c.kind === "A" ? "added" : c.kind === "D" ? "deleted" : "modified",
      })),
      { placeHolder: `Choose a file to view diff (A=${this.a} ↔ B=${this.b})` }
    );
    if (!picked) return;

    // Use the side-by-side logic (writes temp files via CLI show-file and opens vscode.diff)
    await vscode.commands.executeCommand(
      "gitcrumbs.openFileSideBySide",
      picked.label, // relPath
      this.a,
      this.b
    );
  }

  private stripAnsi(s: string) {
    return s.replace(/\x1B\[[0-9;]*m/g, "");
  }

  private async reload() {
    if (!this.a || !this.b) {
      this.changes = [];
      this.loadKey = null;
      this.refresh();
      return;
    }
    const repo = this.store.repoPath();
    if (!repo) {
      this.changes = [];
      this.loadKey = null;
      this.refresh();
      return;
    }

    const key = `${this.a}:${this.b}`;
    if (this.loading && this.loadKey === key) return;

    this.loading = true;
    this.loadKey = key;
    this.refresh();

    const res = await this.cli.run(
      ["diff", String(this.a), String(this.b), "--all"],
      repo
    );
    this.loading = false;

    if (res.code !== 0) {
      await this.cli.showError(
        res,
        `gitcrumbs diff ${this.a} ${this.b} failed.`
      );
      this.changes = [];
      this.refresh();
      return;
    }

    this.changes = this.parseGitcrumbsDiff(this.stripAnsi(res.stdout));
    this.refresh();
  }

  private parseGitcrumbsDiff(text: string): Change[] {
    const out: Change[] = [];
    const lines = text.split(/\r?\n/);
    const row =
      /^\s*[│|]\s*(Added|Deleted|Modified)\s*[│|]\s*(\d+)\s*[│|]\s*(.*?)\s*[│|]?\s*$/;
    const toKind = (c: string): Kind =>
      c === "Added" ? "A" : c === "Deleted" ? "D" : "M";
    for (const line of lines) {
      const m = row.exec(line);
      if (!m) continue;
      const cat = m[1],
        count = Number(m[2]),
        filesCell = (m[3] || "").trim();
      if (!count || !filesCell || filesCell === "(none)") continue;
      for (const raw of filesCell
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
        out.push({ path: raw, kind: toKind(cat) });
      }
    }
    return out;
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem {
    return el;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.a || !this.b) {
      return this.getHeader();
    }

    if (!element) {
      const nodes: vscode.TreeItem[] = this.getHeader();

      if (this.loading) {
        const loading = new vscode.TreeItem(
          "Loading diffs…",
          vscode.TreeItemCollapsibleState.None
        );
        loading.iconPath = new vscode.ThemeIcon("sync~spin");
        nodes.push(loading);
        return nodes;
      }

      nodes.push(new GroupItem("Added", "A", this.count("A")));
      nodes.push(new GroupItem("Modified", "M", this.count("M")));
      nodes.push(new GroupItem("Deleted", "D", this.count("D")));
      return nodes;
    }

    if (element instanceof GroupItem) {
      if (this.loading)
        return [
          new vscode.TreeItem("Loading…", vscode.TreeItemCollapsibleState.None),
        ];
      const items = this.changes
        .filter((c) => c.kind === element.kind)
        .map((c) => new FileItem(c.path, c.kind, this.a!, this.b!));
      return items.length
        ? items
        : [new vscode.TreeItem("(none)", vscode.TreeItemCollapsibleState.None)];
    }

    return [];
  }

  private count(k: Kind) {
    return this.changes.filter((c) => c.kind === k).length;
  }

  private getHeader() {
    let headerItem = [];

    if (this.a || this.b) {
      const label = new vscode.TreeItem(
        this.label(),
        vscode.TreeItemCollapsibleState.None
      );
      label.contextValue = "gitcrumbs.diff.label";
      headerItem.push(label);
    } else {
      const headerText = "Select two snapshots above for diffing.";
      const header = new vscode.TreeItem(
        headerText,
        vscode.TreeItemCollapsibleState.None
      );
      header.contextValue = "gitcrumbs.diff.header";
      headerItem.push(header);
    }
    return headerItem;
  }

  private label() {
    const a = this.a ?? "–";
    const b = this.b ?? "–";
    return this.a || this.b ? `Snapshots: A=${a}   B=${b}` : "";
  }

  private coerceRelPath(input: unknown): string | null {
    if (typeof input === "string") return input;
    if (input && typeof (input as any).relPath === "string")
      return (input as any).relPath; // our FileItem
    const anyInput = input as any;
    // VS Code TreeItem shapes (label can be string or { label: string })
    if (anyInput?.label) {
      if (typeof anyInput.label === "string") return anyInput.label;
      if (typeof anyInput.label?.label === "string")
        return anyInput.label.label;
    }
    return null;
  }

  public async openFilePatch(relArg: unknown, a?: number, b?: number) {
    // allow callers to override/set A/B before running
    if (typeof a === "number") this.a = a;
    if (typeof b === "number") this.b = b;

    const rel = this.coerceRelPath(relArg);
    if (!rel) {
      vscode.window.showErrorMessage("Could not determine file path to diff.");
      return;
    }

    const repo = this.store.repoPath();
    if (!repo || !this.a || !this.b) {
      vscode.window.showInformationMessage("Select Snapshot A and B first.");
      return;
    }

    const log = vscode.window.createOutputChannel("Gitcrumbs");
    const candidates = this.buildPathCandidates(rel, repo);

    for (const p of candidates) {
      for (const flag of ["-f", "--file-path"]) {
        const args = ["diff", String(this.a), String(this.b), flag, p];
        log.appendLine(
          `[gitcrumbs] run: ${this.cli.bin} ${args.join(" ")}  (cwd=${repo})`
        );
        const res = await this.cli.run(args, repo);

        const content = res.stdout || res.stderr || "";
        const doc = await vscode.workspace.openTextDocument({
          content,
          language: "diff",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        return; // we paste whatever the CLI returned
      }
    }

    vscode.window.showErrorMessage(
      `Couldn't run gitcrumbs diff for '${rel}'. Check the "Gitcrumbs" Output.`
    );
  }

  private buildPathCandidates(rel: string, repoRoot: string): string[] {
    // Normalize suspicious whitespace
    const clean = rel
      .replace(/[\u00A0\u2000-\u200B]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // POSIX path (gitcrumbs expects a repo-relative POSIX path)
    const posix = clean.replace(/\\/g, "/").replace(/^\/+/, "");
    const norm = path.posix.normalize(posix);
    const withDot = norm.startsWith("./") ? norm : `./${norm}`;

    // Absolute variant (gitcrumbs accepts absolute paths if inside repo)
    const abs = path.posix.join(repoRoot.replace(/\\/g, "/"), norm);

    // Unique order-preserving set
    const set = new Set<string>([clean, posix, norm, withDot, abs]);
    return Array.from(set).filter(Boolean);
  }
}

class GroupItem extends vscode.TreeItem {
  constructor(label: string, public readonly kind: Kind, count: number) {
    super(`${label} (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "gitcrumbs.diff.group";
    this.iconPath = new vscode.ThemeIcon(
      kind === "A"
        ? "diff-added"
        : kind === "D"
        ? "diff-removed"
        : "diff-modified"
    );
  }
}

class FileItem extends vscode.TreeItem {
  constructor(
    public readonly relPath: string,
    public readonly kind: Kind,
    public readonly a: number,
    public readonly b: number
  ) {
    super(relPath, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gitcrumbs.diff.file";
    this.iconPath = new vscode.ThemeIcon(
      kind === "A"
        ? "diff-added"
        : kind === "D"
        ? "diff-removed"
        : "diff-modified"
    );
    // Clicking the file opens the unified patch using only the CLI
    this.command = {
      title: "Open Side-by-Side",
      command: "gitcrumbs.openFileSideBySide",
      arguments: [this.relPath, this.a, this.b],
    };
  }
}
