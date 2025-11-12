import * as vscode from 'vscode';

export class Store {
  private revision = 0;
  constructor() {}

  bumpRevision() { this.revision++; }

  repoPath(): string | undefined {
    const cfg = vscode.workspace.getConfiguration('gitcrumbs');
    const configured = cfg.get<string>('repoPath', '').trim();
    if (configured) return configured;
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  repoId(): string {
    const path = this.repoPath() ?? 'no-repo';
    let h = 0; for (const c of path) { h = ((h<<5)-h) + c.charCodeAt(0); h |= 0; }
    return Math.abs(h).toString(36);
  }

  config(): { scanInterval: number; snapshotAfter: number } {
    const cfg = vscode.workspace.getConfiguration('gitcrumbs');
    return {
      scanInterval: cfg.get<number>('scanInterval', 30),
      snapshotAfter: cfg.get<number>('snapshotAfter', 90)
    };
  }
}
