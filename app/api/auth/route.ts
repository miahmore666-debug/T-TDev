import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 401 }
      );
    }

    return NextResponse.redirect(`${requestUrl.origin}/`, {
      status: 301,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}