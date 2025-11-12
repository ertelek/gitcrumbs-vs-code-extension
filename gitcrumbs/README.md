# 🧩 Gitcrumbs Extension

**Gitcrumbs** is an extension for the [Gitcrumbs CLI](https://github.com/ertelek/gitcrumbs) — a lightweight tool for keeping track of groups of file changes before you create a commit, allowing you to browse through older states of your repo and compare the file changes.  

This extension provides an intuitive **Timeline View** and **Diff View** inside VS Code, allowing you to create snapshots of file changes, explore them, and compare your repository’s evolving states without leaving your editor.

---

## 💡 When to Use Gitcrumbs

Gitcrumbs is especially useful when:

- You **vibe code** or **experiment frequently** and want a safety net between commits.  
- You need to **recover** code from a few iterations ago without reverting commits.  
- You work in **long-lived feature branches** and want fine-grained history.  
- You’re reviewing changes and want a **semantic diff of working states** over time.

In short: **Gitcrumbs complements Git**, offering a higher-resolution view of the history of your repo.

---

## ✨ Key Features

- **Snapshot your working directory** at any point in time, even between commits.
- **Automatically track file changes** as you work.
- **View the complete snapshot timeline** for your current repository.
- **Restore** previous snapshots to return to an earlier state.
- **Compare** any two snapshots side-by-side in a familiar Git-style diff viewer.
- **Seamlessly integrated** into the VS Code sidebar — no terminal required.
- **CLI-compatible** — all operations run through the official `gitcrumbs` binary.

---

## 🧰 Prerequisites

Before using this extension, you’ll need to have:

1. **Gitcrumbs CLI** installed on your system.  
   You can verify installation with:
   ```bash
   gitcrumbs --version
   ```
   If you don’t have it yet, visit the [Gitcrumbs documentation](https://github.com/ertelek/gitcrumbs) for installation instructions.

2. A valid **Git repository** — Gitcrumbs works per-repository.

---

## 🚀 Getting Started

### 1. Install the Extension

Search for **“Gitcrumbs”** in the VS Code Extensions Marketplace or run:

```bash
ext install ertelek.gitcrumbs
```

Then reload VS Code.

### 2. Open the Gitcrumbs Panel

Click the **Gitcrumbs icon** in the Activity Bar to open the **Snapshot Timeline** and **Diff** views.

You’ll see these panels:
- **Timeline:** Displays snapshots and actions for managing your repo history.
- **Diff:** Allows you to compare snapshots and view detailed changes.

---

## 🧭 Typical Workflow

### Step 1: Select a Repository

If your workspace contains multiple folders, select the repository you want to work with.

- In the VS Code sidebar, open **Gitcrumbs**.
- In the **Actions** view, click **“Change Repository”**.
- Pick the folder containing your git repository.

### Step 2: Take a Snapshot

Click **“Snapshot Now”** to capture the current file changes.  
The snapshot will appear instantly in the **Snapshot Timeline** view.

Snapshots store:
- The Git branch name
- Modified, added, and deleted files
- The timestamp and summary of changes

### Step 3: Compare Snapshots

In the **Snapshot Timeline**, right-click any two snapshots to **Set as Snapshot A** and **Set as Snapshot B**.  
Then open the **Diff** tab to see what changed between them — added, modified, and deleted files.

Clicking a file in the **Diff** view opens a **side-by-side comparison** using VS Code’s diff viewer.

### Step 4: Restore a Snapshot

To roll back your files to an earlier state, right-click a snapshot and choose **Restore Snapshot**.

---

## 🔄 Live Tracking

When you start tracking, new snapshots are created automatically as you edit and save files. If you do not see the snapshot yet in the **Snapshot Timeline**, just click **“Refresh Timeline”**.

You can start and stop tracking from the **Tracking** view or the command palette:
```
> Gitcrumbs: Start Tracking
> Gitcrumbs: Stop Tracking
```

---

## ⚙️ Commands Overview

| Command | Description |
|----------|-------------|
| **Gitcrumbs: Select Repository** | Choose the active repository root. |
| **Gitcrumbs: Snapshot Now** | Capture the current working directory state. |
| **Gitcrumbs: Refresh Timeline** | Reload the list of snapshots. |
| **Gitcrumbs: Set Snapshot A / B** | Choose snapshots for diff comparison. |
| **Gitcrumbs: Clear Selection** | Clear selected snapshots. |
| **Gitcrumbs: Open Diff** | Open side-by-side comparison of Snapshot A and B. |
| **Gitcrumbs: Restore Snapshot** | Restore repository to a saved snapshot. |
| **Gitcrumbs: Start/Stop Tracking** | Begin or end continuous snapshot tracking. |

---

## 🧩 Configuration

You can customize settings under **Settings → Extensions → Gitcrumbs**:

| Setting | Description | Default |
|----------|-------------|----------|
| `gitcrumbs.path` | Path to the `gitcrumbs` CLI binary. | `"gitcrumbs"` |
| `gitcrumbs.repoPath` | Default repository root to use for commands. | *(unset)* |

---

## 🐛 Troubleshooting

**No timeline appears**  
→ Make sure you’ve selected a valid Git repository and that the `gitcrumbs` CLI is installed.

**Diffs show “no differences”**  
→ Check that both snapshots exist in the same repository and that they contain tracked changes.

**The timeline doesn’t update after snapshotting**  
→ Click the **“Refresh Timeline”** action.

---

## 🤝 Contributing

Contributions are welcome!  
If you’d like to add features, improve UX, or fix bugs, open an issue or pull request in the project repository.

---

## 🪶 License

MIT License — © 2025 Értelek
