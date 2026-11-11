/** Short buzz for a tap that should feel responsive - a no-op on desktop
 * browsers/devices without vibration support. */
export function tapHaptic() {
  navigator.vibrate?.(15);
}
