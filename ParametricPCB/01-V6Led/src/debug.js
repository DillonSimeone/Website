export const isDebugEnabled = (() => {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
})();

export const logDebug = (msg) => {
  if (isDebugEnabled) {
    console.log(msg);
  }
};
