import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardNav from '@/components/dashboard-nav';
import AnnouncementBanner from '@/components/announcement-banner';
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes';
import AuthInterceptor from '@/components/auth-interceptor';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Tier 1 of the auth guard: any request that lands on a dashboard route
// must have a JWT cookie that (a) verifies cryptographically and (b)
// points at a user that still exists in the database. If either check
// fails we bounce to /login with a reason flag, which the login page
// uses to show a friendly "Your session expired" banner.
//
// Why server-side: this layout is a Server Component so the check runs
// before any HTML is sent. The user never sees a broken dashboard flash
// the way they would with a client-side `useEffect` redirect.
//
// Why not just verify the JWT: a valid-but-stale cookie (e.g. user got
// deleted, database got wiped, account was banned) would still pass a
// signature check. We have to actually look the user up in the DB.
async function ensureAuthedUser() {
  const token = (await cookies()).get('auth_token')?.value;
  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;

  // Minimal projection – we only need to know the user still exists. The
  // child pages do their own fuller fetches via /api/auth/me.
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true },
  });
  return user;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureAuthedUser();
  if (!user) {
    // Redirect at render time. The stale cookie stays in the browser but
    // does no harm – it just gets overwritten on the next successful
    // login. (Clearing it from a Server Component would require a
    // workaround; not worth the complexity for this case.)
    //
    // Lands on the marketing page, not straight to the login form — a
    // signed-out visitor sees the app's front door first (Sign In is one
    // click away from there either way).
    redirect('/');
  }

  return (
    <UnsavedChangesProvider>
      <AuthInterceptor>
        <div className="min-h-screen bg-[#0a0e17] relative">
          {/* Background — same depth treatment as the landing page so the
              app doesn't go flat after login. CSS gradients only (cheap on
              iOS Safari). */}
          <div className="fixed inset-0 pointer-events-none">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse 700px 500px at 20% -10%, rgba(244,63,94,0.10), transparent 60%), radial-gradient(ellipse 700px 500px at 85% 110%, rgba(59,130,246,0.08), transparent 60%), radial-gradient(ellipse 500px 400px at 70% 20%, rgba(168,85,247,0.05), transparent 65%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '52px 52px',
                maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 100%)',
              }}
            />
          </div>
          <DashboardNav />
          <AnnouncementBanner />
          <main className="relative z-10 px-4 md:px-6 py-6">
            {children}
          </main>
        </div>
      </AuthInterceptor>
    </UnsavedChangesProvider>
  );
}
