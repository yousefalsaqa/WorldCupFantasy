import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('👥 Checking Active Users & Sessions\n');
  console.log('=====================================\n');

  const now = new Date();

  // Get recent sessions (last 5 minutes) to catch active users
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const recentSessions = await prisma.session.findMany({
    where: {
      createdAt: {
        gte: fiveMinutesAgo,
      },
    },
    include: {
      user: {
        include: {
          team: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Get all active sessions (not expired)
  const activeSessions = await prisma.session.findMany({
    where: {
      expiresAt: {
        gt: now,
      },
    },
    include: {
      user: {
        include: {
          team: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`📊 Active Sessions: ${activeSessions.length}`);
  console.log(`🕐 Recent Sessions (Last 5 min): ${recentSessions.length}\n`);

  if (recentSessions.length > 0) {
    // Group by user
    const recentUsers = new Map<string, typeof recentSessions[0]['user']>();
    for (const session of recentSessions) {
      if (!recentUsers.has(session.userId)) {
        recentUsers.set(session.userId, session.user);
      }
    }

    console.log(`👤 Recently Active Users: ${recentUsers.size}\n`);
    for (const [userId, user] of Array.from(recentUsers.entries())) {
      const userRecentSessions = recentSessions.filter(s => s.userId === userId);
      const latestSession = userRecentSessions[0];
      const isActive = latestSession.expiresAt > now;

      console.log(`   ${isActive ? '🟢 ONLINE' : '🟡 RECENT'} ${user.username} (${user.email})`);
      console.log(`   ├─ Team: ${user.team?.name || 'No team'}`);
      console.log(`   ├─ Last Session: ${new Date(latestSession.createdAt).toLocaleString()}`);
      console.log(`   ├─ Expires: ${new Date(latestSession.expiresAt).toLocaleString()}`);
      console.log(`   └─ Status: ${isActive ? 'ACTIVE' : 'EXPIRED (but recently active)'}`);
      console.log('');
    }
  }

  if (activeSessions.length === 0 && recentSessions.length === 0) {
    console.log('   No active or recent sessions found.\n');
  } else if (activeSessions.length > 0) {
    // Group by user to avoid duplicates
    const activeUsers = new Map<string, typeof activeSessions[0]['user']>();

    for (const session of activeSessions) {
      if (!activeUsers.has(session.userId)) {
        activeUsers.set(session.userId, session.user);
      }
    }

    console.log(`👤 Active Users: ${activeUsers.size}\n`);

    for (const [userId, user] of Array.from(activeUsers.entries())) {
      const userSessions = activeSessions.filter(s => s.userId === userId);
      const latestSession = userSessions[0];

      console.log(`   ${user.username} (${user.email})`);
      console.log(`   ├─ Team: ${user.team?.name || 'No team'}`);
      console.log(`   ├─ Last Login: ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}`);
      console.log(`   ├─ Active Sessions: ${userSessions.length}`);
      console.log(`   └─ Latest Session: ${new Date(latestSession.createdAt).toLocaleString()}`);
      console.log('');
    }
  }

  // Get all users with recent activity (last 30 minutes - more accurate for "online now")
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const recentUsers = await prisma.user.findMany({
    where: {
      OR: [
        {
          lastLoginAt: {
            gte: thirtyMinutesAgo,
          },
        },
        {
          team: {
            updatedAt: {
              gte: thirtyMinutesAgo,
            },
          },
        },
      ],
    },
    include: {
      team: {
        include: {
          squadPlayers: {
            take: 1,
            orderBy: {
              id: 'desc',
            },
          },
        },
      },
      sessions: {
        where: {
          expiresAt: {
            gt: now,
          },
        },
      },
    },
    orderBy: {
      lastLoginAt: 'desc',
    },
  });

  console.log(`\n🟢 Recently Active (Last 30 min): ${recentUsers.length} users\n`);

  if (recentUsers.length > 0) {
    for (const user of recentUsers) {
      const loginTime = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
      const teamUpdateTime = user.team?.updatedAt ? new Date(user.team.updatedAt).getTime() : 0;
      const mostRecent = Math.max(loginTime, teamUpdateTime);
      const minutesAgo = Math.floor((now.getTime() - mostRecent) / (60 * 1000));
      
      console.log(`   🟢 ${user.username} (${user.email})`);
      console.log(`   ├─ Last Login: ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}`);
      if (user.team?.updatedAt && teamUpdateTime > loginTime) {
        console.log(`   ├─ Last Team Update: ${new Date(user.team.updatedAt).toLocaleString()} (${minutesAgo} min ago)`);
      }
      console.log(`   ├─ Team: ${user.team?.name || 'No team'}`);
      console.log(`   └─ Status: ${minutesAgo < 5 ? '🟢 VERY RECENT (likely online)' : minutesAgo < 30 ? '🟡 RECENT' : '⚪ OLD'}`);
      console.log('');
    }
  }

  // Get all users summary
  const allUsers = await prisma.user.findMany({
    include: {
      team: true,
      sessions: {
        where: {
          expiresAt: {
            gt: now,
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`\n📈 Total Users: ${allUsers.length}`);
  console.log(`   ├─ With Teams: ${allUsers.filter(u => u.team).length}`);
  console.log(`   ├─ Admins: ${allUsers.filter(u => u.isAdmin).length}`);
  console.log(`   └─ Total Active Sessions: ${activeSessions.length}`);

  // Show ALL users
  console.log(`\n📋 All Users:\n`);
  for (const user of allUsers) {
    const hasActiveSession = user.sessions.length > 0;
    const status = hasActiveSession ? '🟢 ONLINE' : '⚪ OFFLINE';
    console.log(`   ${status} ${user.username} (${user.email})`);
    console.log(`   ├─ Created: ${new Date(user.createdAt).toLocaleString()}`);
    console.log(`   ├─ Last Login: ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}`);
    console.log(`   ├─ Team: ${user.team?.name || 'No team'}`);
    console.log(`   └─ Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
