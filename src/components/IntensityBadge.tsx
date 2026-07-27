import type { ComplexityBand } from "../types";

interface IntensityBadgeProps {
  band: ComplexityBand | null;
  intensity: number | null;
  estimatedMinutes?: number | null;
  /** Intensity after ageing. Shown when it differs, to explain queue movement. */
  effectiveIntensity?: number | null;
  compact?: boolean;
}

const BAND_LABEL: Record<ComplexityBand, string> = {
  trivial: "Trivial",
  small: "Small",
  moderate: "Moderate",
  large: "Large",
  epic: "Epic"
};

function formatEstimate(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes}m`;
  }
  const hours = minutes / 60;
  return hours < 10 ? `~${hours.toFixed(1)}h` : `~${Math.round(hours)}h`;
}

/**
 * Shows a task's assessed cost.
 *
 * Bands rather than raw numbers: "Moderate" is honest about the precision on
 * offer, where "intensity 46" implies more than a heuristic can support. The
 * exact figures are in the tooltip for anyone who wants them.
 */
export function IntensityBadge({
  band,
  intensity,
  estimatedMinutes,
  effectiveIntensity,
  compact = false
}: IntensityBadgeProps) {
  if (!band || intensity === null) {
    return null;
  }

  // A job that has aged is being promoted past cheaper work; say so rather than
  // leaving its position unexplained.
  const aged =
    typeof effectiveIntensity === "number" && effectiveIntensity < intensity - 1;

  const tooltip = [
    `Intensity ${intensity}/100`,
    aged ? `aged to ${effectiveIntensity} while waiting` : null,
    typeof estimatedMinutes === "number" ? `estimated ${estimatedMinutes} min` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`app-intensity-badge app-intensity-badge--${band} ${
        compact ? "app-intensity-badge--compact" : ""
      }`}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className="app-intensity-badge__dot" aria-hidden="true" />
      {BAND_LABEL[band]}
      {typeof estimatedMinutes === "number" && !compact ? (
        <span className="app-intensity-badge__estimate">{formatEstimate(estimatedMinutes)}</span>
      ) : null}
      {aged ? (
        <span className="app-intensity-badge__aged" aria-hidden="true">
          ↑
        </span>
      ) : null}
    </span>
  );
}
