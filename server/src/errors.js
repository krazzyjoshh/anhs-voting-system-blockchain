const MESSAGES = {
  400: "Invalid request.", 401: "Please log in.", 402: "The wallet has insufficient SOL.",
  403: "This operation is not allowed.", 409: "The request conflicts with the current state.",
  429: "Too many requests. Please try again later.",
  502: "Unable to get a response from the blockchain.",
  503: "The system is temporarily unavailable. Please try again later or contact COMELEC.",
};
function safeMessage(error) {
  return MESSAGES[error?.status] || "A server error occurred.";
}
function logError(event, error) {
  // Never log raw RPC errors, request bodies, credentials or transaction data.
  console.error(JSON.stringify({ event, status: Number(error?.status) || 500 }));
}
module.exports = { safeMessage, logError };
