// supabase/functions/send-email/index.ts
import { serve } from "std/http/server"
import { createClient } from "@supabase/supabase-js"

// @ts-ignore: Deno global is provided by the Supabase Edge runtime
declare const Deno: { env: { get(key: string): string | undefined } };

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

serve(async (req: Request) => {
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
            .filter((item: Record<string, unknown>) => item?.name && item?.content)
            .map((item: Record<string, unknown>) => ({
              name: String(item.name),
              content: String(item.content),
            }))
        : undefined

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Fetch all admin emails
      const { data: admins, error: adminError } = await supabaseAdmin
        .from('profiles')
        .select('email, id')
        .eq('role', 'admin')
        .eq('is_deleted', false)

      if (adminError) {
        console.error('Error fetching admins:', adminError)
      }

      const adminEmails = (admins || [])
        .map((a: Record<string, unknown>) => a.email)
        .filter((email: unknown): email is string => typeof email === 'string' && email.includes('@'))
      
      const fallbackEmail = Deno.env.get('BUG_REPORT_RECIPIENT') || 'alfonzperez92@gmail.com'
      const recipients = adminEmails.length > 0 ? Array.from(new Set(adminEmails)) : [fallbackEmail]

      // Try to save to bug_reports table
      try {
        await supabaseAdmin.from('bug_reports').insert({
          reporter_name: reporterName,
          reporter_email: reporterEmail === 'N/A' ? null : reporterEmail,
          description: description,
          source: source,
          attachment_note: attachmentNote,
          status: 'pending',
          created_at: new Date().toISOString()
        })
      } catch (dbError) {
        console.warn('Could not save bug report to database:', dbError)
      }

      // Send to all admins
      await Promise.all(recipients.map((email: string) => 
        sendBrevoEmail({
          to: email,
          subject: `Abalay Bug Report - ${reporterName}`,
          htmlContent: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #f97316; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">New Bug Report</h1>
              </div>
              <div style="padding: 24px; background-color: white;">
                <p style="margin-top: 0;">Hi Admin,</p>
                <p>A new bug has been reported from the <strong>${escapeHtml(source)}</strong>.</p>
                
                <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; font-weight: bold; color: #9a3412;">Description:</p>
                  <p style="margin: 8px 0 0; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(description)}</p>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Reporter</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: right;">${escapeHtml(reporterName)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Email</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: right;">${escapeHtml(reporterEmail)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Attachment</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-style: italic; text-align: right;">${escapeHtml(attachmentNote)}</td>
                  </tr>
                </table>

                <div style="margin-top: 30px; text-align: center;">
                  <a href="https://abalay-rent.me/admin" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">View in Admin Dashboard</a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #eee;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated system notification from Abalay Rent.</p>
              </div>
            </div>
          `,
          attachments,
        })
      ))

      return new Response(
        JSON.stringify({ success: true, message: `Bug report sent to ${recipients.length} admins` }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    if (body?.type === 'bulk_email') {
      const subject = String(body?.subject || '').trim()
      const htmlContent = String(body?.htmlContent || '').trim()
      const recipients = Array.isArray(body?.recipients) ? body.recipients : []

      if (!subject || !htmlContent || recipients.length === 0) {
        throw new Error('Subject, content, and at least one recipient are required')
      }

      // Instead of looping individual emails which might hit rate limits, we send them sequentially or grouped, but here sequentially for safety
      for (const email of recipients) {
        await sendBrevoEmail({
          to: email,
          subject,
          htmlContent,
        })
      }

      return new Response(
        JSON.stringify({ success: true, message: `Sent bulk email to ${recipients.length} recipients` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (body?.type === 'monthly_statement') {
      const targetMonth = String(body?.month || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }))
      
      const adminEmail = Deno.env.get('BUG_REPORT_RECIPIENT') || 'alfonzperez92@gmail.com'
      
      await sendBrevoEmail({
        to: adminEmail,
        subject: `System Triggered: Monthly Statements Generated (${targetMonth})`,
        htmlContent: `
          <h2>Monthly Statements Triggered</h2>
          <p>The system has generated and dispatched the automated statements for ${escapeHtml(targetMonth)}.</p>
          <p>Please check the admin dashboard for detailed logs.</p>
        `,
      })

      return new Response(
        JSON.stringify({ success: true, message: 'Monthly statements processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (body?.type === 'booking_rejection_reason') {
      const bookingId = body?.bookingId
      const reason = String(body?.reason || '').trim()
      if (!bookingId) throw new Error('Booking ID is required')
      if (!reason) throw new Error('Rejection reason is required')

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

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

      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(booking.tenant)
      const tenantEmail = userData?.user?.email

      if (!tenantEmail) throw new Error('Could not find tenant email')

      const viewingDate = booking.booking_date ? new Date(booking.booking_date) : null
      const viewingDateText = viewingDate
        ? viewingDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : 'N/A'
      const viewingTimeText = viewingDate
        ? viewingDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : 'N/A'

      await sendBrevoEmail({
        to: tenantEmail,
        subject: 'Viewing Request Update - Abalay',
        htmlContent: `
          <h2>Your viewing request was rejected</h2>
          <p><strong>Property:</strong> ${escapeHtml(booking.property?.title || 'Property')}</p>
          <p><strong>Address:</strong> ${escapeHtml(`${booking.property?.address || ''}, ${booking.property?.city || ''}`)}</p>
          <p><strong>Schedule:</strong> ${escapeHtml(viewingDateText)} at ${escapeHtml(viewingTimeText)}</p>
          <p><strong>Reason from landlord:</strong></p>
          <p style="white-space: pre-wrap;">${escapeHtml(reason)}</p>
          <p><strong>Landlord:</strong> ${escapeHtml(`${booking.landlord_profile?.first_name || ''} ${booking.landlord_profile?.last_name || ''}`.trim() || 'N/A')}</p>
          <p><strong>Contact:</strong> ${escapeHtml(booking.landlord_profile?.phone || 'N/A')}</p>
        `,
      })

      return new Response(
        JSON.stringify({ success: true, message: 'Rejection email sent' }),
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
    const { data: userData, error: _userError } = await supabaseAdmin.auth.admin.getUserById(booking.tenant)
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

  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})