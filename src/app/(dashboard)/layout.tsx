import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardNav from '@/components/dashboard-nav';
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
    redirect('/login?reason=session_expired');
  }

  return (
    <UnsavedChangesProvider>
      <AuthInterceptor>
        <div className="min-h-screen bg-[#0a0e17] relative">
          {/* Subtle background */}
          <div className="fixed inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(125deg,#0a0e17_0%,#0a0e17_40%,#10141f_50%,#0a0e17_60%,#0a0e17_100%)]"></div>
            <div className="absolute top-0 right-0 w-1/3 h-1/2 bg-[radial-gradient(ellipse_at_top_right,rgba(220,38,38,0.03),transparent)]"></div>
            <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-[radial-gradient(ellipse_at_bottom_left,rgba(37,99,235,0.03),transparent)]"></div>
          </div>
          <DashboardNav />
          <main className="relative z-10 px-4 md:px-6 py-6">
            {children}
          </main>
        </div>
      </AuthInterceptor>
    </UnsavedChangesProvider>
  );
}
