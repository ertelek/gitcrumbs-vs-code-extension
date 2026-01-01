import * as vscode from "vscode";

type TrackingPreference = "auto" | "never";

export class Store {
  private revision = 0;

  readonly requiredGitcrumbsVersion = "0.1.8";

  gitcrumbsVersion: string | null = null;

  gitcrumbsVersionMatches: boolean | null = null;

  // We keep a handle to the extension context
  constructor(private readonly context: vscode.ExtensionContext) {}

  bumpRevision() {
    this.revision++;
  }

  repoPath(): string | undefined {
    const cfg = vscode.workspace.getConfiguration("gitcrumbs");
    const configured = cfg.get<string>("repoPath", "").trim();
    if (configured) return configured;
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Compute a stable ID for a given repo path.
   */
  repoIdForPath(repoPath: string): string {
    const path = repoPath || "no-repo";
    let h = 0;
    for (const c of path) {
      h = (h << 5) - h + c.charCodeAt(0);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  /**
   * Repo ID for the *current* repoPath().
   */
  repoId(): string {
    return this.repoIdForPath(this.repoPath() ?? "no-repo");
  }

  /**
   * Extension configuration relevant to tracking.
   *
   * The CLI now uses filesystem watching instead of polling, so the only
   * knob we expose is `snapshotAfter`: how long the repo must stay quiet
   * before a new snapshot is created.
   */
  config(): { snapshotAfter: number } {
    const cfg = vscode.workspace.getConfiguration("gitcrumbs");
    return {
      snapshotAfter: cfg.get<number>("snapshotAfter", 90),
    };
  }

  // ---------- Tracking preferences (per repo) ----------

  private trackingPrefsKey = "gitcrumbs.trackingPreferences";

  private readTrackingPrefs(): Record<string, TrackingPreference> {
    return (
      this.context.workspaceState.get<Record<string, TrackingPreference>>(
        this.trackingPrefsKey,
        {}
      ) ?? {}
    );
  }

  private async writeTrackingPrefs(
    prefs: Record<string, TrackingPreference>
  ): Promise<void> {
    await this.context.workspaceState.update(this.trackingPrefsKey, prefs);
  }

  getTrackingPreference(repoId: string): TrackingPreference | undefined {
    const prefs = this.readTrackingPrefs();
    return prefs[repoId];
  }

  async setTrackingPreference(
    repoId: string,
    pref: TrackingPreference
  ): Promise<void> {
    const prefs = this.readTrackingPrefs();
    if (prefs[repoId] === pref) return;
    prefs[repoId] = pref;
    await this.writeTrackingPrefs(prefs);
  }

  async clearTrackingPreference(repoId: string): Promise<void> {
    const prefs = this.readTrackingPrefs();
    if (!(repoId in prefs)) return;
    delete prefs[repoId];
    await this.writeTrackingPrefs(prefs);
  }
}
