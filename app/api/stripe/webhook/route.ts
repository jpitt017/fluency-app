import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Use service role key to securely write to Supabase bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // 1. Verify webhook signature securely using raw body and secret
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  const subscription = event.data.object as Stripe.Subscription;
  
  // Extract userId either from direct metadata or customer object metadata
  const userId = subscription.metadata?.userId;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (!userId) {
          console.warn(`⚠️ Subscription ${subscription.id} missing userId metadata.`);
          break;
        }

        // 2. Idempotent upsert using subscription.id as primary key
        // This guarantees retried duplicate events update the existing row safely.
        const { error } = await supabaseAdmin.from('subscriptions').upsert({
          id: subscription.id,
          user_id: userId,
          status: subscription.status,
          price_id: subscription.items.data[0].price.id,
          quantity: subscription.items.data[0].quantity ?? 1,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: new Date((subscription.current_period_end as number) * 1000).toISOString(),
        });

        if (error) {
          console.error('Supabase upsert error:', error);
          throw error;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        // Mark subscription status as canceled idempotently
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('id', subscription.id);

        if (error) {
          console.error('Supabase update error on deletion:', error);
          throw error;
        }
        break;
      }

      default:
        console.log(`Unhandled relevant event type: ${event.type}`);
    }
  } catch (dbErr: any) {
    console.error(`Database error processing webhook ${event.type}:`, dbErr);
    return NextResponse.json({ error: 'Webhook database processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}