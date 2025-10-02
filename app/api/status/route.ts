import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Get deployment status
    const { data: appStatus } = await supabase
      .from('app_status')
      .select('*')
      .single();
      
    // Get recent deployments
    const { data: deployments } = await supabase
      .from('deployments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
      
    // Get recent errors
    const { data: errors } = await supabase
      .from('deployment_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      status: appStatus?.status || 'unknown',
      deployments: deployments || [],
      errors: errors || []
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}