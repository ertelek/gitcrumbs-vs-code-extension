import * as vscode from "vscode";

export class TrackingView implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(el: vscode.TreeItem) {
    return el;
  }

  getChildren(): vscode.TreeItem[] {
    const headerText =
      "Hover over me then click Start tracking to start tracking your file changes.";
    const header = new vscode.TreeItem(
      headerText,
      vscode.TreeItemCollapsibleState.None
    );
    return [header];
  }
}
