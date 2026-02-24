import { pad2 } from "../shared/time";

type Logger = Pick<typeof console, "log" | "error">;
type WriteStreamLike = Pick<NodeJS.WriteStream, "isTTY" | "write">;

const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;

export interface CliProgressIndicatorOptions {
  logger: Logger;
  label: string;
  stream?: WriteStreamLike;
  nowMs?: () => number;
  tickMs?: number;
}

export interface CliProgressIndicator {
  start(): void;
  stop(): void;
  log(message: string): void;
  error(message: string): void;
  setLabel(label: string): void;
  elapsedMs(): number;
  elapsedLabel(): string;
}

export function formatElapsedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  return `${pad2(minutes)}:${pad2(seconds)}`;
}

export function createCliProgressIndicator(options: CliProgressIndicatorOptions): CliProgressIndicator {
  const logger = options.logger;
  const stream = options.stream ?? process.stdout;
  const nowMs = options.nowMs ?? Date.now;
  const tickMs = options.tickMs ?? 125;
  const interactive = Boolean(stream.isTTY);

  let label = options.label;
  let startedAtMs = 0;
  let spinnerFrameIndex = 0;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;
  let lastRenderedWidth = 0;
  let active = false;

  function elapsedMs(): number {
    if (startedAtMs === 0) {
      return 0;
    }
    return Math.max(0, nowMs() - startedAtMs);
  }

  function elapsedLabel(): string {
    return formatElapsedDuration(elapsedMs());
  }

  function render(): void {
    if (!active || !interactive) {
      return;
    }

    const frame = SPINNER_FRAMES[spinnerFrameIndex % SPINNER_FRAMES.length];
    spinnerFrameIndex += 1;
    const line = `${frame} ${label} (elapsed ${elapsedLabel()})`;
    const padding = Math.max(0, lastRenderedWidth - line.length);
    stream.write(`\r${line}${" ".repeat(padding)}`);
    lastRenderedWidth = line.length;
  }

  function clearLine(): void {
    if (!interactive || lastRenderedWidth === 0) {
      return;
    }
    stream.write(`\r${" ".repeat(lastRenderedWidth)}\r`);
    lastRenderedWidth = 0;
  }

  function clearForLog(): void {
    if (!active) {
      return;
    }
    clearLine();
  }

  function maybeRestoreAfterLog(): void {
    if (!active) {
      return;
    }
    render();
  }

  return {
    start(): void {
      if (active) {
        return;
      }

      startedAtMs = nowMs();
      spinnerFrameIndex = 0;
      active = true;

      if (!interactive) {
        return;
      }

      render();
      intervalHandle = setInterval(render, tickMs);
      intervalHandle.unref?.();
    },

    stop(): void {
      if (!active) {
        return;
      }

      active = false;
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = undefined;
      }
      clearLine();
    },

    log(message: string): void {
      clearForLog();
      logger.log(message);
      maybeRestoreAfterLog();
    },

    error(message: string): void {
      clearForLog();
      logger.error(message);
      maybeRestoreAfterLog();
    },

    setLabel(nextLabel: string): void {
      label = nextLabel;
      if (active) {
        render();
      }
    },

    elapsedMs,
    elapsedLabel,
  };
}
