import { supabase } from './supabase';

// Get all invoices for the current user, newest first
export async function getInvoices(userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Get a single invoice with its items
export async function getInvoiceWithItems(invoiceId) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  if (invoiceError) throw invoiceError;

  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('id', { ascending: true });
  if (itemsError) throw itemsError;

  return { ...invoice, items: items || [] };
}

// ── Clean item before DB insert — strips UI-only fields, ensures numeric types ──
function cleanItem(item, invoiceId, userId) {
  return {
    invoice_id:   invoiceId,
    user_id:      userId,
    product_id:   item.product_id   || null,
    product_name: String(item.product_name || '').trim(),
    quantity:     parseFloat(item.quantity)  || 1,    // DECIMAL — supports 0.5, 1.5 etc.
    unit:         String(item.unit || 'piece'),
    price:        parseFloat(item.price)     || 0,
    discount:     parseFloat(item.discount)  || 0,
    total:        parseFloat(item.total)     || 0,
    // Explicitly NOT including: isNewProduct, any other React state fields
  };
}

// Create a new invoice (with items)
export async function createInvoice(userId, invoiceData, items) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert([{ ...invoiceData, user_id: userId }])
    .select()
    .single();
  if (invoiceError) throw invoiceError;

  const cleanedItems = items.map(item => cleanItem(item, invoice.id, userId));

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(cleanedItems);
  if (itemsError) throw itemsError;

  // Update customer's total_purchase
  if (invoiceData.customer_id) {
    try {
      await supabase.rpc('update_customer_total_purchase', {
        customer_id: invoiceData.customer_id,
        amount: invoiceData.final_amount
      });
    } catch (e) {
      // RPC might not exist — non-fatal, just log
      console.warn('[invoiceService] update_customer_total_purchase RPC not found:', e.message);
    }
  }

  return invoice;
}

// Update an invoice — deletes old items and inserts new ones
export async function updateInvoice(invoiceId, userId, invoiceData, items) {
  // 1. Update the invoice record
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update(invoiceData)
    .eq('id', invoiceId)
    .eq('user_id', userId);
  if (invoiceError) throw invoiceError;

  // 2. Delete existing items
  const { error: deleteError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId);
  if (deleteError) throw deleteError;

  // 3. Insert cleaned items (ensures no stray fields hit the DB)
  const cleanedItems = items.map(item => cleanItem(item, invoiceId, userId));

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(cleanedItems);
  if (itemsError) throw itemsError;

  return true;
}

// Delete an invoice (cascade delete via FK handles invoice_items)
export async function deleteInvoice(invoiceId, userId) {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

// Search invoices by invoice number or customer name (debounced in UI)
export async function searchInvoices(userId, query) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .or(`invoice_no.ilike.%${query}%,customer_name.ilike.%${query}%`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Duplicate an invoice with a new invoice number and today's date
export async function duplicateInvoice(invoiceId, userId, newInvoiceNo) {
  // 1. Load the original
  const original = await getInvoiceWithItems(invoiceId);

  // 2. Create new invoice (reset amounts, keep customer + items)
  const today = new Date().toLocaleDateString('en-CA');
  const time  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const { data: newInvoice, error } = await supabase
    .from('invoices')
    .insert([{
      user_id:        userId,
      invoice_no:     newInvoiceNo,
      date:           today,
      time,
      customer_id:    original.customer_id    || null,
      customer_name:  original.customer_name,
      customer_phone: original.customer_phone,
      subtotal:       original.subtotal,
      discount_total: original.discount_total,
      final_amount:   original.final_amount,
      payment_status: 'unpaid',   // duplicated invoices start as unpaid
      amount_due:     original.final_amount,
    }])
    .select()
    .single();
  if (error) throw error;

  // 3. Copy items
  const newItems = original.items.map(item => cleanItem(item, newInvoice.id, userId));
  if (newItems.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(newItems);
    if (itemsError) throw itemsError;
  }

  return newInvoice;
}

// Get invoice statistics for dashboard/analytics
export async function getInvoiceStats(userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('final_amount, payment_status, amount_due, date, created_at')
    .eq('user_id', userId);
  if (error) throw error;

  const invoices   = data || [];
  const totalRev   = invoices.reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
  const totalDue   = invoices.reduce((s, i) => s + (Number(i.amount_due)   || 0), 0);
  const paidCount  = invoices.filter(i => i.payment_status === 'paid').length;
  const unpaidCount = invoices.filter(i => i.payment_status === 'unpaid').length;

  // Last 7 days revenue
  const now = new Date();
  const last7 = invoices.filter(i => {
    const d = new Date(i.created_at);
    return (now - d) / (1000 * 60 * 60 * 24) <= 7;
  }).reduce((s, i) => s + (Number(i.final_amount) || 0), 0);

  return { totalRevenue: totalRev, totalDue, paidCount, unpaidCount, totalInvoices: invoices.length, last7DaysRevenue: last7 };
}