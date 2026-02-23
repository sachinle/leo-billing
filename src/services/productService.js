import { supabase } from './supabase';

export async function getProducts(userId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function addProduct(userId, product) {
  const { data, error } = await supabase
    .from('products')
    .insert([{ ...product, user_id: userId }])
    .select();
  if (error) throw error;
  return data[0];
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

export async function searchProducts(userId, query) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${query}%`)
    .order('name');
  if (error) throw error;
  return data;
}