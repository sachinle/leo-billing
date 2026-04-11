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

// Get a single customer by ID (includes loyalty_points)
export async function getCustomer(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Award loyalty points via RPC (100 pts per qualifying purchase)
export async function addLoyaltyPoints(customerId, points) {
  try {
    const { error } = await supabase.rpc('add_loyalty_points', {
      p_customer_id: customerId,
      p_points: points,
    });
    if (error) throw error;
  } catch (e) {
    console.warn('[customerService] add_loyalty_points RPC:', e.message);
  }
}

// Redeem 1000 loyalty points (apply ₹50 discount)
export async function redeemLoyaltyPoints(customerId) {
  try {
    const { error } = await supabase.rpc('redeem_loyalty_points', {
      p_customer_id: customerId,
    });
    if (error) throw error;
  } catch (e) {
    console.warn('[customerService] redeem_loyalty_points RPC:', e.message);
  }
}