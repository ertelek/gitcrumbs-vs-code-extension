import * as vscode from "vscode";

export class TrackingView implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(el: vscode.TreeItem) {
    return el;
  }

  getChildren(): vscode.TreeItem[] {
    const headerText =
      "You can Start or Stop Tracking your file changes here.";
    const header = new vscode.TreeItem(
      headerText,
      vscode.TreeItemCollapsibleState.None
    );
    return [header];
  }
}
