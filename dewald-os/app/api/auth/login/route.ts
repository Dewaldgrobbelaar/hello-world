import { NextRequest, NextResponse } from 'next/server';
import { createToken, COOKIE, MAX_AGE, timingSafeEqual } from '@/lib/auth';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const data = await req.formData();
  const password = data.get('password');

  const expected = process.env.DASHBOARD_PASSWORD ?? '';
  const secret = process.env.AUTH_SECRET ?? '';

  if (!expected || !secret) {
    return NextResponse.redirect(new URL('/login?error=config', req.url));
  }

  if (typeof password !== 'string' || !timingSafeEqual(password, expected)) {
    return NextResponse.redirect(new URL('/login?error=1', req.url));
  }

  const token = await createToken(secret);
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
  return res;
}
