/** Keep the daily-limit message simple and never advertise to pilot or staff. */
export function dailyLimitMessage(tier, pricingEnabled) {
  const message = "You've done a lot of practice today! You can use the AI again tomorrow.";
  return tier === 'free' && pricingEnabled ? `${message} You can also upgrade to Pro for more practice.` : message;
}
