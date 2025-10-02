import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const headersList = headers();
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    const payload = await request.json();
    
    // Log the webhook event
    console.log('Webhook received:', payload);
    
    // Handle different webhook events
    switch (payload.type) {
      case 'deployment.succeeded':
        // Update deployment status in database
        await supabase.from('deployments').insert({
          status: 'success',
          url: payload.payload.url,
          deployment_id: payload.payload.id,
          created_at: new Date().toISOString()
        });
        break;
        
      case 'deployment.error':
        // Log deployment errors
        await supabase.from('deployment_errors').insert({
          error: payload.payload.error,
          deployment_id: payload.payload.id,
          created_at: new Date().toISOString()
        });
        break;
        
      case 'deployment.ready':
        // Update application status
        await supabase.from('app_status').upsert({
          id: 1,
          status: 'ready',
          last_deployment: payload.payload.id,
          updated_at: new Date().toISOString()
        });
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}