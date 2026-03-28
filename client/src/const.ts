export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Returns the path to the custom login page. */
export const getLoginUrl = (_returnPath?: string): string => {
  const base = "/login";
  if (_returnPath && _returnPath !== "/") {
    return `${base}?returnTo=${encodeURIComponent(_returnPath)}`;
  }
  return base;
};
