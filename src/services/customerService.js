import { supabase } from './supabase';

// Get all customers for the current user
export async function getCustomers(userId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data;
}

// Add a new customer
export async function addCustomer(userId, customer) {
  const { data, error } = await supabase
    .from('customers')
    .insert([{ ...customer, user_id: userId }])
    .select();
  if (error) throw error;
  return data[0];
}

// Update an existing customer
export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data[0];
}

// Delete a customer
export async function deleteCustomer(id) {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// Search customers by name or phone
export async function searchCustomers(userId, query) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .order('name');
  if (error) throw error;
  return data;
}