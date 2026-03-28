/**
 * Maps integration — STUB
 *
 * The Manus Forge Google Maps proxy has been removed. This file is kept as a
 * no-op stub so that any dead-code imports continue to compile without errors.
 *
 * To restore maps functionality, integrate directly with the Google Maps
 * Platform APIs using your own API key:
 *   https://developers.google.com/maps/documentation
 *
 * Set GOOGLE_MAPS_API_KEY in your environment and replace the stub below
 * with a real implementation.
 *
 * NOTE: The RILAN Roku Platform does not currently use any maps features.
 *       This file can be safely deleted once all imports are removed.
 */

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";
export type MapType = "roadmap" | "satellite" | "terrain" | "hybrid";
export type SpeedUnit = "KPH" | "MPH";
export type LatLng = { lat: number; lng: number };

/** @deprecated Maps integration is not configured. */
export async function makeRequest<T = unknown>(
  _endpoint: string,
  _params: Record<string, unknown> = {},
  _options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
): Promise<T> {
  throw new Error(
    "Maps integration is not configured. " +
      "Set GOOGLE_MAPS_API_KEY and implement makeRequest() in server/_core/map.ts."
  );
}
