/** Normalize transient media values before they enter a domain snapshot. */
export function clampPlaybackPosition(
  positionSeconds: number,
  durationSeconds: number | null,
): number {
  const position = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return position;
  }
  return Math.min(position, durationSeconds);
}

/** Unknown, infinite, or zero duration cannot yield a meaningful percentage. */
export function getPlaybackProgressPercent(
  positionSeconds: number,
  durationSeconds: number | null,
): number | null {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return (clampPlaybackPosition(positionSeconds, durationSeconds) / durationSeconds) * 100;
}

/** A loop must not turn a finished video into a resumable position near its end. */
export function isPlaybackCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
): boolean {
  const percentage = getPlaybackProgressPercent(positionSeconds, durationSeconds);
  return percentage !== null && percentage >= 95;
}

export function getResumablePosition(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
): number | null {
  const position = clampPlaybackPosition(positionSeconds, durationSeconds);
  if (completed || position < 3 || isPlaybackCompleted(position, durationSeconds)) return null;
  if (
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds - position <= 2
  )
    return null;
  return position;
}
