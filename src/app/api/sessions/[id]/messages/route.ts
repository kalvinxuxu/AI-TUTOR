import { NextResponse } from 'next/server';

// GET /api/sessions/[id]/messages - Get session messages
export async function GET() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}

// POST /api/sessions/[id]/messages - Send a message
export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}