// Errors that services throw on purpose. The server turns each into an HTTP
// status and a short message for the page (see server/http.js).

/** Input was rejected. `field` names the form field to highlight, if any. */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/** The requested record does not exist. */
export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The change would duplicate an existing record. */
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}
