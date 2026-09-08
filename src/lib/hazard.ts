/**
 * A checkpoint is hazardous for driving when it is cold enough AND wet: at or
 * below the temperature threshold and with some precipitation. Ported verbatim
 * from the original route_calculator.py rule.
 */
export function isHazardous(tempC: number, precipMm: number, thresholdC: number): boolean {
  return tempC <= thresholdC && precipMm > 0
}
