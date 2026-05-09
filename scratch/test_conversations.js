const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zyyrarvawwqpnolukuav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eXJhcnZhd3dxcG5vbHVrdWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2MzE2MTAsImV4cCI6MjA3NzIwNzYxMH0.oX7ep9QIkc04eGzOzkegFL5zxUSSzZ-5yW3IMMgiUBM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: convs, error: err1 } = await supabase.from('conversations').select('*');
  if (err1) {
    console.error('Error fetching conversations:', err1);
    return;
  }
  console.log('Conversations count:', convs.length);

  const { data: msgs, error: err2 } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20);
  if (err2) {
    console.error('Error fetching messages:', err2);
    return;
  }
  console.log('Messages count:', msgs.length);

  const participantIds = new Set();
  convs.forEach(c => {
    participantIds.add(c.landlord_id);
    participantIds.add(c.tenant_id);
  });
  msgs.forEach(m => {
    participantIds.add(m.sender_id);
    participantIds.add(m.receiver_id);
  });

  const { data: profiles, error: err3 } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url').in('id', Array.from(participantIds));
  if (err3) {
    console.error('Error fetching profiles:', err3);
    return;
  }

  console.log('Active Profiles:');
  profiles.forEach(p => {
    console.log(`- ${p.first_name} ${p.last_name} (${p.id}): avatar_url=${p.avatar_url}`);
  });
}

run();
