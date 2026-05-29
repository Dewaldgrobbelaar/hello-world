import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifyToken, timingSafeEqual } from '@/lib/auth';

const PUBLIC = ['/login', '/api/auth/', '/api/webhook'];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET ?? '';

  // Programmatic access for API routes via x-api-secret header
  if (pathname.startsWith('/api/')) {
    const header = req.headers.get('x-api-secret') ?? '';
    if (header.length > 0 && timingSafeEqual(header, secret)) {
      return NextResponse.next();
    }
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (token !== undefined && (await verifyToken(token, secret))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
