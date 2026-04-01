// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const sendBrevoEmail = async ({
  to,
  subject,
  htmlContent,
  attachments,
}: {
  to: string
  subject: string
  htmlContent: string
  attachments?: { name: string; content: string }[]
}) => {
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_API_KEY) throw new Error('Missing BREVO_API_KEY')

  const payload: Record<string, unknown> = {
    sender: { email: 'alfnzperez@gmail.com', name: 'Abalay' },
    to: [{ email: to }],
    subject,
    htmlContent,
  }

  if (attachments && attachments.length > 0) {
    payload.attachment = attachments
  }

  const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!emailResponse.ok) {
    const errText = await emailResponse.text()
    throw new Error(`Brevo Error: ${errText}`)
  }
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    if (body?.type === 'bug_report') {
      const reporterName = String(body?.reporterName || 'Anonymous').trim() || 'Anonymous'
      const reporterEmail = body?.reporterEmail ? String(body.reporterEmail) : 'N/A'
      const description = String(body?.description || '').trim()
      const source = String(body?.source || 'unknown').trim() || 'unknown'
      const attachmentNote = body?.attachmentNote
        ? String(body.attachmentNote)
        : 'No attachment'

      if (!description) throw new Error('Issue description is required')

      const attachments = Array.isArray(body?.attachments)
        ? body.attachments
            .filter((item: any) => item?.name && item?.content)
            .map((item: any) => ({
              name: String(item.name),
              content: String(item.content),
            }))
        : undefined

      const bugReportRecipient = Deno.env.get('BUG_REPORT_RECIPIENT') || 'alfonzperez92@gmail.com'

      await sendBrevoEmail({
        to: bugReportRecipient,
        subject: `Abalay Bug Report - ${reporterName}`,
        htmlContent: `
          <h2>New Bug Report</h2>
          <p><strong>Source:</strong> ${escapeHtml(source)}</p>
          <p><strong>Reported by:</strong> ${escapeHtml(reporterName)}</p>
          <p><strong>User Email:</strong> ${escapeHtml(reporterEmail)}</p>
          <p><strong>Issue Description:</strong></p>
          <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${escapeHtml(description)}</pre>
          <p><strong>Attachment:</strong> ${escapeHtml(attachmentNote)}</p>
        `,
        attachments,
      })

      return new Response(
        JSON.stringify({ success: true, message: 'Bug report sent' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    const bookingId = body?.bookingId
    if (!bookingId) throw new Error('Booking ID is required')

    // Initialize Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch Booking Details
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(title, address, city),
        tenant_profile:profiles!bookings_tenant_fkey(first_name, last_name),
        landlord_profile:profiles!bookings_landlord_fkey(first_name, last_name, phone)
      `)
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) throw new Error('Booking not found')

    // Get Tenant Email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(booking.tenant)
    const tenantEmail = userData?.user?.email

    if (!tenantEmail) throw new Error('Could not find tenant email')

    // Format Data
    const viewingDate = new Date(booking.booking_date)
    const hour = viewingDate.getHours()
    let timeSlot = 'Custom Time'
    if (hour === 8) timeSlot = 'Morning (8:00 AM - 11:00 AM)'
    if (hour === 13) timeSlot = 'Afternoon (1:00 PM - 5:30 PM)'

    await sendBrevoEmail({
      to: tenantEmail,
      subject: 'Viewing Approved - EaseRent',
      htmlContent: `
        <h1>Good news! Your viewing is approved.</h1>
        <p><strong>Property:</strong> ${booking.property?.title}</p>
        <p><strong>Address:</strong> ${booking.property?.address}, ${booking.property?.city}</p>
        <p><strong>Date:</strong> ${viewingDate.toDateString()}</p>
        <p><strong>Time:</strong> ${timeSlot}</p>
        <p><strong>Landlord:</strong> ${booking.landlord_profile?.first_name} ${booking.landlord_profile?.last_name}</p>
        <p><strong>Contact:</strong> ${booking.landlord_profile?.phone || 'N/A'}</p>
      `,
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})