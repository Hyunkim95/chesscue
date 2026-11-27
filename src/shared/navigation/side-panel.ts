export const isSidePanel =
  location.protocol === "chrome-extension:" &&
  new URLSearchParams(location.search).get("panel") === "1";
