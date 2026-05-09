const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zyyrarvawwqpnolukuav.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eXJhcnZhd3dxcG5vbHVrdWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2MzE2MTAsImV4cCI6MjA3NzIwNzYxMH0.oX7ep9QIkc04eGzOzkegFL5zxUSSzZ-5yW3IMMgiUBM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url').ilike('first_name', '%Alfonz%');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
