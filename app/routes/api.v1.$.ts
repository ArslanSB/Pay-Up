import { api, apiError } from "../lib/api.server";

/** Anything under /api/v1 that no other route claims answers in the API's own error shape, not the app's HTML 404. */
const unknownEndpoint = api(async () => apiError(404, "not_found", "No such API endpoint."));

export const loader = unknownEndpoint;
export const action = unknownEndpoint;
