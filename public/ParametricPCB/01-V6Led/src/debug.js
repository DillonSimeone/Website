export const isDebugEnabled = false;

export const logDebug = (msg) => {
  if (isDebugEnabled) {
    console.log(msg);
  }
};
