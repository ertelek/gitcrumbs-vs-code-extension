import * as vscode from "vscode";

export class ActionsView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: vscode.TreeItem) {
    return el;
  }
  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    return [
      makeCmdItem("Change Repository", "gitcrumbs.selectRepo", "folder-opened"),
      makeCmdItem("Refresh Timeline", "gitcrumbs.refreshTimeline", "refresh"),
      makeCmdItem("Snapshot Now", "gitcrumbs.snapshotNow", "zap"),
    ];
  }
}

function makeCmdItem(label: string, command: string, icon: string) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { title: label, command };
  item.iconPath = new vscode.ThemeIcon(icon);
  item.contextValue = "gitcrumbs.action";
  return item;
}
