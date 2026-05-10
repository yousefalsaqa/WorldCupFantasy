import DashboardNav from '@/components/dashboard-nav';
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
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
    </UnsavedChangesProvider>
  );
}
