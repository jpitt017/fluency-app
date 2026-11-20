import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(apiKey);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin environment variables are not configured');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

interface SubscriptionLike {
  id: string;
  status: string;
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      current_period_end?: number | null;
    }>;
  };
}

function extractPeriodEnd(subscription: SubscriptionLike): string | null {
  const epoch =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null;
  return typeof epoch === 'number' ? new Date(epoch * 1000).toISOString() : null;
}

export async function POST(req: NextRequest) {
  let stripe: Stripe;
  let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;

  try {
    stripe = getStripeClient();
    supabaseAdmin = getSupabaseAdmin();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server configuration error' },
      { status: 500 },
    );
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: 'Missing Stripe signature or webhook secret' },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Invalid signature'}` },
      { status: 400 },
    );
  }

  const { data: existingEvent } = await supabaseAdmin
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { error: insertError } = await supabaseAdmin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to record webhook event: ${insertError.message}` },
      { status: 500 },
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (userId && subscriptionId) {
          const subscription = (await stripe.subscriptions.retrieve(
            subscriptionId,
          )) as unknown as SubscriptionLike;

          const periodEnd = extractPeriodEnd(subscription);

          await supabaseAdmin
            .from('profiles')
            .update({
              stripe_customer_id:
                typeof session.customer === 'string'
                  ? session.customer
                  : session.customer?.id ?? null,
              stripe_subscription_id: subscriptionId,
              subscription_status: subscription.status,
              current_period_end: periodEnd,
            })
            .eq('id', userId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as unknown as SubscriptionLike;
        const periodEnd = extractPeriodEnd(subscription);

        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: subscription.status,
            current_period_end: periodEnd,
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Webhook handler failed: ${err instanceof Error ? err.message : 'Unexpected error'}` },
      { status: 500 },
    );
  }
}
