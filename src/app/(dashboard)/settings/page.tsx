import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { User, Mail, Calendar, Shield } from 'lucide-react';
import { TimezoneSettingCard } from '@/components/timezone-picker';

export default async function SettingsPage() {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      team: {
        select: {
          name: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-laliga-cream mb-2">
          SETTINGS
        </h1>
        <p className="text-surface-400">
          Manage your account settings
        </p>
      </div>

      {/* Profile Info */}
      <div className="card mb-6">
        <div className="p-4 border-b border-surface-800">
          <h2 className="font-semibold text-laliga-cream">Profile</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center">
              <span className="text-2xl font-bold text-laliga-dark">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-xl font-semibold text-laliga-cream">{user.username}</p>
              <p className="text-surface-400">{user.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account Details */}
      <div className="card mb-6">
        <div className="p-4 border-b border-surface-800">
          <h2 className="font-semibold text-laliga-cream">Account Details</h2>
        </div>
        <div className="divide-y divide-surface-800">
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
              <User className="w-5 h-5 text-surface-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-surface-400">Username</p>
              <p className="text-laliga-cream">{user.username}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
              <Mail className="w-5 h-5 text-surface-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-surface-400">Email</p>
              <p className="text-laliga-cream">{user.email}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-surface-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-surface-400">Member Since</p>
              <p className="text-laliga-cream">
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          {user.isAdmin && (
            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-laliga-gold/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-laliga-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-surface-400">Role</p>
                <p className="text-laliga-gold">Administrator</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card mb-6">
        <div className="p-4 border-b border-surface-800">
          <h2 className="font-semibold text-laliga-cream">Preferences</h2>
        </div>
        <div className="divide-y divide-surface-800">
          <TimezoneSettingCard />
        </div>
      </div>

      {/* Team Info */}
      {user.team && (
        <div className="card">
          <div className="p-4 border-b border-surface-800">
            <h2 className="font-semibold text-laliga-cream">Team Info</h2>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <p className="text-sm text-surface-400 mb-1">Team Name</p>
              <p className="text-xl font-semibold text-laliga-cream">{user.team.name}</p>
            </div>
            <div>
              <p className="text-sm text-surface-400 mb-1">Created</p>
              <p className="text-laliga-cream">
                {new Date(user.team.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="card mt-6 border-laliga-red/20">
        <div className="p-4 border-b border-surface-800">
          <h2 className="font-semibold text-laliga-red">Danger Zone</h2>
        </div>
        <div className="p-6">
          <p className="text-surface-400 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button className="px-4 py-2 rounded-lg border border-laliga-red text-laliga-red hover:bg-laliga-red/10 transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}


