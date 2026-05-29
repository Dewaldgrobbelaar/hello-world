import { NextRequest, NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth';

function clearAndRedirect(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.delete(COOKIE);
  return res;
}

export function GET(req: NextRequest): NextResponse {
  return clearAndRedirect(req);
}

export function POST(req: NextRequest): NextResponse {
  return clearAndRedirect(req);
}
