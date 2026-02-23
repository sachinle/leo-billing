import { supabase } from './supabase';

// Get the business profile for the current user
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();                // returns null (not error) if no row yet
  if (error) throw error;
  return data;
}

// Upsert (create or update) the business profile
export async function saveProfile(userId, profile) {
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(
      { ...profile, user_id: userId },
      { onConflict: 'user_id' }    // unique on user_id
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Mark an invoice as paid (update payment_status + amount_due)
export async function markInvoicePaid(invoiceId, userId) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ payment_status: 'paid', amount_due: 0 })
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}