import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // Accept either `identifier` (new clients) or `email` (legacy clients
    // still sending the original payload). Either field may carry a
    // username OR an email — we disambiguate by checking for an `@`.
    const body = await request.json();
    const identifierRaw: string | undefined = body.identifier ?? body.email;
    const password: string | undefined = body.password;

    if (!identifierRaw || !password) {
      return NextResponse.json(
        { error: 'Username or email and password are required' },
        { status: 400 }
      );
    }

    const identifier = identifierRaw.trim();
    const looksLikeEmail = identifier.includes('@');

    // Look up by email OR username. Both fields are unique in the schema, so
    // a single findFirst keeps us at one round-trip. We always lowercase the
    // email branch (we store emails canonically) but keep usernames
    // case-insensitive via Prisma's `mode: 'insensitive'` — users who
    // registered "Yousef" should still be able to log in as "yousef".
    const user = await prisma.user.findFirst({
      where: looksLikeEmail
        ? { email: identifier.toLowerCase() }
        : { username: { equals: identifier, mode: 'insensitive' } },
    });

    // Generic error message either way — never leak which half of the
    // credential was wrong (classic user-enumeration mitigation).
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username/email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid username/email or password' },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = await createToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin
    });

    // Set cookie
    await setAuthCookie(token);

    // Fire-and-forget the lastLoginAt update. The user's response should not
    // wait on this DB write – it was adding ~100-300ms to every login on the
    // serverless cold path. Errors are swallowed because this is purely
    // bookkeeping and never fails business logic.
    prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch((err) => console.error('lastLoginAt update failed:', err));

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
