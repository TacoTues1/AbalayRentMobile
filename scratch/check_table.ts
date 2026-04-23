
import { supabase } from './lib/supabase';

async function checkTable() {
  const { data, error } = await supabase.from('login_records').select('*').limit(1);
  if (error) {
    console.log('Table login_records does not exist or error:', error.message);
  } else {
    console.log('Table login_records exists!');
  }
}

checkTable();
