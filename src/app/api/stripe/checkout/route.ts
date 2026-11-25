import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(apiKey);
}

export async function POST(req: NextRequest) {
  let stripe: Stripe;

  try {
    stripe = getStripeClient();
  } catch (err: unknown) {
    // The technical detail belongs in the server log, not on the pricing page.
    console.error('[checkout] Stripe client unavailable:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again, or message your teacher.' },
      { status: 500 },
    );
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              // Ignored when called from a context that cannot mutate cookies
            }
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to subscribe.' },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { priceId?: string };
    const priceId = body.priceId || process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      console.error('[checkout] STRIPE_PRICE_ID is not configured');
      return NextResponse.json(
        { error: 'Something went wrong. Please try again, or message your teacher.' },
        { status: 400 },
      );
    }

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('[checkout] session creation failed:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again, or message your teacher.' },
      { status: 500 },
    );
  }
}
