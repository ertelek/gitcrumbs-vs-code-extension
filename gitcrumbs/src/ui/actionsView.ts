import * as vscode from "vscode";
import * as path from "path";
import { Store } from "../state/store";

export class ActionsView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: Store) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: vscode.TreeItem) {
    return el;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];

    // Top item: current repo (folder name only)
    const repoPath = this.store.repoPath();
    const repoLabel = repoPath
      ? `Repository: ${path.basename(repoPath)}`
      : "Repository: (not set)";
    const repoItem = new vscode.TreeItem(
      repoLabel,
      vscode.TreeItemCollapsibleState.None
    );
    // repoItem.iconPath = new vscode.ThemeIcon("root-folder");
    repoItem.contextValue = "gitcrumbs.repoInfo";
    items.push(repoItem);

    // Action items
    items.push(
      makeCmdItem("Change Repository", "gitcrumbs.selectRepo", "folder-opened"),
      makeCmdItem("Refresh Timeline", "gitcrumbs.refreshTimeline", "refresh"),
      makeCmdItem("Snapshot Now", "gitcrumbs.snapshotNow", "zap")
    );

    return items;
  }
}

function makeCmdItem(label: string, command: string, icon: string) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { title: label, command };
  item.iconPath = new vscode.ThemeIcon(icon);
  item.contextValue = "gitcrumbs.action";
  return item;
}
