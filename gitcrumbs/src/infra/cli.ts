import * as vscode from "vscode";
import {
  spawn,
  execFileSync,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import * as os from "os";

export type CliResult = { code: number; stdout: string; stderr: string };

export class Cli {
  private resolvedBin: string | null = null;
  readonly bin: string;

  constructor(bin: string) {
    this.bin = bin;
  }

  static commandExists(cmd: string, cwd: string): boolean {
    try {
      const sh = os.platform() === "win32" ? "cmd" : "bash";
      const args =
        os.platform() === "win32"
          ? ["/c", `where ${cmd}`]
          : ["-lc", `command -v ${cmd} || which ${cmd}`];
      const out = execFileSync(sh, args, { cwd, encoding: "utf8" })
        .trim()
        .split(/\r?\n/)[0];
      return Boolean(out);
    } catch {
      return false;
    }
  }

  static async runRaw(
    bin: string,
    args: string[],
    cwd: string
  ): Promise<CliResult> {
    return new Promise<CliResult>((resolve) => {
      const child = spawn(bin, args, {
        cwd,
        shell: false,
        env: { ...process.env, COLUMNS: "10000", NO_COLOR: "1" },
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (b) => (stdout += b.toString()));
      child.stderr.on("data", (b) => (stderr += b.toString()));
      child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
      child.on("error", () =>
        resolve({ code: 127, stdout: "", stderr: `Failed to run ${bin}` })
      );
    });
  }

  private resolveBin(cwd: string): string {
    if (this.resolvedBin) return this.resolvedBin;
    try {
      const sh = os.platform() === "win32" ? "cmd" : "bash";
      const args =
        os.platform() === "win32"
          ? ["/c", `where ${this.bin}`]
          : ["-lc", `command -v ${this.bin} || which ${this.bin}`];
      const out = execFileSync(sh, args, { cwd, encoding: "utf8" })
        .trim()
        .split(/\r?\n/)[0];
      if (out) this.resolvedBin = out;
    } catch {}
    this.resolvedBin = this.resolvedBin || this.bin;
    vscode.window
      .createOutputChannel("Gitcrumbs")
      .appendLine(`[gitcrumbs] using binary: ${this.resolvedBin}`);
    return this.resolvedBin!;
  }

  async run(args: string[], cwd: string): Promise<CliResult> {
    const bin = this.resolveBin(cwd);
    return new Promise<CliResult>((resolve) => {
      const child = spawn(bin, args, {
        cwd,
        shell: false,
        env: { ...process.env, COLUMNS: "10000", NO_COLOR: "1" },
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (b) => (stdout += b.toString()));
      child.stderr.on("data", (b) => (stderr += b.toString()));
      child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  }

  runBackground(args: string[], cwd: string): ChildProcessWithoutNullStreams {
    const bin = this.resolveBin(cwd);
    return spawn(bin, args, {
      cwd,
      shell: false,
      env: { ...process.env, COLUMNS: "10000", NO_COLOR: "1" },
    });
  }

  async showError(res: CliResult, friendly: string) {
    const detail = `Exit ${res.code}\n\nSTDOUT:\n${res.stdout}\n\nSTDERR:\n${res.stderr}`;
    const choice = await vscode.window.showErrorMessage(
      friendly,
      "Show Details"
    );
    if (choice === "Show Details")
      await vscode.window.showInformationMessage(detail, { modal: true });
  }
}
