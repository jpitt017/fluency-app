import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    // 1. Verify authorization using your Service Role Key
    const authHeader = request.headers.get('Authorization');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Initialize Supabase Admin Client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { success: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not configured.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Define curriculum modules to seed (matching database schema columns)
    const modulesToSeed = [
      {
        title: 'Module 1: Foundations of B1 Communication',
        description: 'Mastering everyday workplace interactions and polite professional discourse.'
      },
      {
        title: 'Module 2: Advanced British Expressions & Idioms',
        description: 'Navigating subtle British nuances, understatement, and cultural idioms.'
      },
      {
        title: 'Module 3: Professional Email & Written Correspondence',
        description: 'Crafting clear, tactful, and effective corporate communications.'
      },
      {
        title: 'Module 4: Meetings, Negotiations & Assertiveness',
        description: 'Contributing confidently and respectfully in team discussions and negotiations.'
      }
      // You can add your remaining curriculum modules here as needed
    ];

    // 4. Insert modules into Supabase using upsert
    const { data, error } = await supabase
      .from('modules')
      .upsert(modulesToSeed, { onConflict: 'title' })
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, phase: 'Module insert', error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Modules successfully seeded!',
      count: data?.length || 0,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}