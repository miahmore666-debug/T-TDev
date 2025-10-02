import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const headersList = headers();
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: compounds, error: queryError } = await supabase
      .from('mv_recent_compounds')
      .select('*');

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({ compounds });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}