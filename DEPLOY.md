# 🚀 Deploying World Cup 2026 Fantasy to Vercel

## Step 1: Create Free Database (Neon)

1. Go to [neon.tech](https://neon.tech) and sign up (free)
2. Create a new project called "worldcup-fantasy"
3. Copy the connection string - it looks like:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Import your repository (you'll need to push to GitHub first)
3. In the deployment settings, add these **Environment Variables**:
   
   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | Your Neon connection string |
   | `JWT_SECRET` | A random secret (make it long!) |

4. Click **Deploy**!

## Step 3: Initialize Database

After deployment, run this in your terminal:
```bash
npx prisma db push
npx prisma db seed
```

Or use Vercel's CLI:
```bash
vercel env pull
npx prisma db push
npx prisma db seed
```

## Your Link

Once deployed, you'll get a URL like:
```
https://worldcup-fantasy-xxx.vercel.app
```

Share this with your friends! 🎉

---

## Quick Push to GitHub

```bash
git init
git add .
git commit -m "World Cup 2026 Fantasy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/worldcup-fantasy.git
git push -u origin main
```

Then import in Vercel!
