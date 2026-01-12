import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Tailwind class merger utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format price for display (e.g., 7.5 -> "£7.5m")
export function formatPrice(price: number): string {
  return `£${price.toFixed(1)}m`;
}

// Format points with sign
export function formatPoints(points: number, showSign = false): string {
  if (showSign && points > 0) return `+${points}`;
  return points.toString();
}

// Round price to nearest 0.1
export function roundPrice(price: number): number {
  return Math.round(price * 10) / 10;
}

// Calculate sell price with 50% profit rule
export function calculateSellPrice(purchasePrice: number, currentPrice: number): number {
  if (currentPrice <= purchasePrice) {
    // No profit, sell at current price
    return currentPrice;
  }
  
  const profit = currentPrice - purchasePrice;
  const keepableProfit = Math.floor(profit * 5) / 10; // 50% rounded down to 0.1
  return roundPrice(purchasePrice + keepableProfit);
}

// Generate random league code
export function generateLeagueCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Format date for display in Eastern Time
export function formatDeadline(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

// Check if deadline has passed
export function isDeadlinePassed(deadline: Date): boolean {
  return new Date() > deadline;
}

// Get time until deadline
export function getTimeUntilDeadline(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  
  if (diff <= 0) return 'Deadline passed';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Sanitize string input
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Pluralize helper
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + 's'}`;
}

// Ordinal suffix (1st, 2nd, 3rd, etc.)
export function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Delay utility for animations
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


