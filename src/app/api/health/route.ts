import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight health-check endpoint used by Docker's HEALTHCHECK
 * directive and external uptime monitors. Returns 200 OK with a
 * JSON body containing the current timestamp and status.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
