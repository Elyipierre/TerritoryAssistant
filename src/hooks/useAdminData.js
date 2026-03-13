import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { pointInPolygon } from '../utils/territoryMap';
import { applyReviewResolutions, getStoredReviewResolutions, setStoredReviewResolution } from '../utils/reviewQueues';
import { getAccessRequests, saveApprovedProfile, updateAccessRequestStatus } from '../utils/localOps';
import { loadMasterTerritories } from '../utils/masterTerritories';
import { buildAddressIndex, removeAddressRecord, summarizeAddressInventory, updateAddressRecords } from '../utils/addressRepository';

function deriveReviewQueue(territories) {
  const duplicateAddresses = new Map();
  const outOfBoundary = [];
  const geocodeFailures = [];

  territories.forEach((territory) => {
    (territory.addresses || []).forEach((address, index) => {
      const key = address.full || address.address || `Unknown address ${index + 1}`;
      if (!duplicateAddresses.has(key)) duplicateAddresses.set(key, []);
      duplicateAddresses.get(key).push({
        territory: territory.territoryNo,
        address: key,
        locality: territory.locality ?? territory.city ?? '',
        phone: address.phone ?? '',
        email: address.email ?? ''
      });

      if (address.lat == null || address.lng == null) {
        geocodeFailures.push({
          id: `geocode-${territory.territoryNo}-${index}`,
          territory: territory.territoryNo,
          address: key,
          issue: 'Missing coordinates',
          locality: territory.locality ?? territory.city ?? '',
          recommendation: 'Geocode this address or verify the source import.',
          details: address
        });
      } else if (Array.isArray(territory.polygon) && territory.polygon.length >= 3) {
        const inside = pointInPolygon([address.lat, address.lng], territory.polygon.map(([lat, lng]) => [lat, lng]));
        if (!inside) {
          outOfBoundary.push({
            id: `boundary-${territory.territoryNo}-${index}`,
            territory: territory.territoryNo,
            address: key,
            issue: 'Outside polygon boundary',
            locality: territory.locality ?? territory.city ?? '',
            coordinates: `${address.lat}, ${address.lng}`,
            recommendation: 'Confirm the address geocode or adjust the imported address placement.',
            details: address
          });
        }
      }
    });
  });

  const phoneConflicts = [...duplicateAddresses.values()]
    .filter((entries) => entries.length > 1)
    .slice(0, 20)
    .map((entries, index) => ({
      id: `conflict-${index + 1}`,
      issue: 'Duplicate address in multiple territories',
      address: entries[0]?.address,
      locality: entries[0]?.locality ?? '',
      recommendation: 'Merge or reassign the duplicate address so only one territory owns it.',
      entries
    }));

  return {
    phoneConflicts,
    geocodeFailures: geocodeFailures.slice(0, 20),
    outOfBoundary: outOfBoundary.slice(0, 20)
  };
}


function territoryIdMatch(territory, territoryId) {
  return String(territory.id) === String(territoryId) || String(territory.territoryNo ?? '') === String(territoryId);
}

function cloneAddresses(addresses = []) {
  return addresses.map((address) => ({ ...address }));
}


export function useAdminData() {
  const [territories, setTerritories] = useState([]);
  const [users, setUsers] = useState([]);
  const [dncRows, setDncRows] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [accessRequests, setAccessRequests] = useState(getAccessRequests());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [territoryRes, userRes, dncRes, campaignRes] = await Promise.all([
        supabase.from('territories').select('id, territoryNo, locality, is_enabled, territory_state, polygon, addresses').order('territoryNo', { ascending: true }),
        supabase.from('user_roles').select('user_id, email, role, is_pioneer, is_approved, approved_at, created_at, phone_number, carrier, sms_gateway_opt_in, sms_gateway_status, sms_gateway_last_checked_at, preferred_notification_method').order('created_at', { ascending: false }),
        supabase.from('do_not_calls').select('id, territory_id, address, notes, is_verified, created_at').order('created_at', { ascending: false }).limit(25),
        supabase.from('campaigns').select('id, name, start_date, end_date, is_active, created_at').order('start_date', { ascending: false })
      ]);

      const firstError = [territoryRes.error, userRes.error, dncRes.error, campaignRes.error].find(Boolean);
      if (firstError) throw firstError;

      setTerritories(territoryRes.data ?? []);
      setUsers(userRes.data ?? []);
      setDncRows(dncRes.data ?? []);
      setCampaigns(campaignRes.data ?? []);
      setAccessRequests(getAccessRequests());
      setSource('supabase');
      setError(null);
    } catch (err) {
      setError(err);
      setTerritories(await loadMasterTerritories());
      setUsers([]);
      setDncRows([]);
      setCampaigns([]);
      setAccessRequests(getAccessRequests());
      setSource('master');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [reviewResolutions, setReviewResolutions] = useState(getStoredReviewResolutions());
  const reviewQueues = useMemo(() => applyReviewResolutions(deriveReviewQueue(territories), reviewResolutions), [territories, reviewResolutions]);
  const addressInventory = useMemo(() => summarizeAddressInventory(territories), [territories]);
  const addressIndex = useMemo(() => buildAddressIndex(territories), [territories]);

  async function resolveReviewItem(queueKey, itemKey, resolved, notes = '') {
    const next = setStoredReviewResolution(queueKey, itemKey, { resolved, notes });
    setReviewResolutions(next);
    return { ok: true };
  }

  async function verifyDnc(id, is_verified) {
    setDncRows((current) => current.map((row) => row.id === id ? { ...row, is_verified } : row));
    const { error: updateError } = await supabase.from('do_not_calls').update({ is_verified }).eq('id', id);
    if (updateError) {
      setDncRows((current) => current.map((row) => row.id === id ? { ...row, is_verified: !is_verified } : row));
      console.error(updateError);
    }
  }

  async function updateTerritory(id, patch) {
    const previous = territories;
    setTerritories((current) => current.map((territory) => territory.id === id ? { ...territory, ...patch } : territory));
    const { error: updateError } = await supabase.from('territories').update(patch).eq('id', id);
    if (updateError) {
      setTerritories(previous);
      throw updateError;
    }
  }


  async function updateTerritoryAddresses(territoryId, updater) {
    const target = territories.find((territory) => territoryIdMatch(territory, territoryId));
    if (!target) return { ok: false, error: new Error('Territory not found.') };
    const nextAddresses = updater(cloneAddresses(target.addresses || []));
    try {
      await updateTerritory(target.id, { addresses: nextAddresses });
      return { ok: true, territoryId: target.id, addresses: nextAddresses };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function suppressAddressOnTerritory(territoryId, addressValue, patch = {}) {
    return updateTerritoryAddresses(territoryId, (addresses) => updateAddressRecords(addresses, addressValue, (address) => ({ ...address, suppressed: true, review_status: patch.review_status || 'suppressed', review_note: patch.review_note || '', boundary_exception: Boolean(patch.boundary_exception), updated_at: new Date().toISOString() })));
  }

  async function markAddressManualReview(territoryId, addressValue, note = '') {
    return updateTerritoryAddresses(territoryId, (addresses) => updateAddressRecords(addresses, addressValue, (address) => ({ ...address, review_status: 'manual_review', review_note: note, updated_at: new Date().toISOString() })));
  }

  async function resolveDuplicateOwnership(addressValue, keepTerritoryId, note = '') {
    const affected = territories.filter((territory) => (territory.addresses || []).some((address) => String(address.full || address.address) === String(addressValue)));
    const results = [];
    for (const territory of affected) {
      if (String(territory.territoryNo ?? territory.id) === String(keepTerritoryId)) {
        results.push(await updateTerritoryAddresses(territory.id, (addresses) => updateAddressRecords(addresses, addressValue, (address) => ({ ...address, primary_owner: true, review_status: 'conflict_resolved', review_note: note, updated_at: new Date().toISOString() }))));
      } else {
        results.push(await updateTerritoryAddresses(territory.id, (addresses) => removeAddressRecord(addresses, addressValue)));
      }
    }
    return { ok: results.every((result) => result.ok), results };
  }

  async function createVerifiedDncFromReview(item, notes = '') {
    const territoryId = item.territory ?? item.entries?.[0]?.territory;
    const address = item.address ?? item.entries?.[0]?.address;
    if (!territoryId || !address) return { ok: false, error: new Error('Missing territory or address.') };
    const payload = {
      territory_id: String(territoryId),
      address,
      notes: notes || 'Created from review workflow',
      is_verified: true,
      created_at: new Date().toISOString()
    };
    try {
      const { data, error: insertError } = await supabase.from('do_not_calls').insert(payload).select('*').single();
      if (insertError) throw insertError;
      setDncRows((current) => [data, ...current]);
      return { ok: true, data };
    } catch (error) {
      const local = { id: `local-dnc-${Date.now()}`, ...payload };
      setDncRows((current) => [local, ...current]);
      return { ok: false, error, data: local, source: 'local' };
    }
  }

  async function bulkEnableInitialCalls() {
    setBusy(true);
    try {
      const enabledIds = territories.filter((territory) => territory.is_enabled).map((territory) => territory.id);
      if (!enabledIds.length) return { ok: true, count: 0 };
      const { error: updateError } = await supabase.from('territories').update({ territory_state: 'Initial Call' }).in('id', enabledIds);
      if (updateError) throw updateError;
      setTerritories((current) => current.map((territory) => territory.is_enabled ? { ...territory, territory_state: 'Initial Call' } : territory));
      return { ok: true, count: enabledIds.length };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      setBusy(false);
    }
  }

  async function updateUserRole(userId, patch) {
    const previous = users;
    setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, ...patch } : user));
    const { error: updateError } = await supabase.from('user_roles').update(patch).eq('user_id', userId);
    if (updateError) {
      setUsers(previous);
      throw updateError;
    }
  }

  async function approveAccessRequest(request, patch = {}) {
    const payload = {
      user_id: request.user_id,
      email: request.email,
      role: patch.role ?? request.requested_role ?? 'Publisher',
      is_pioneer: Boolean(patch.is_pioneer),
      is_approved: true,
      approved_at: new Date().toISOString()
    };

    saveApprovedProfile(payload);
    setAccessRequests(updateAccessRequestStatus(request.user_id ?? request.email, { status: 'approved', ...payload }));

    try {
      const { error: upsertError } = await supabase.from('user_roles').upsert(payload, { onConflict: 'user_id' });
      if (upsertError) throw upsertError;
      await load();
      return { ok: true, source: 'supabase' };
    } catch (error) {
      await load();
      return { ok: false, error, source: 'local' };
    }
  }

  async function rejectAccessRequest(request) {
    setAccessRequests(updateAccessRequestStatus(request.user_id ?? request.email, { status: 'rejected' }));
    return { ok: true };
  }

  async function createCampaign(payload, options = {}) {
    setBusy(true);
    try {
      const insertPayload = {
        name: payload.name,
        start_date: payload.start_date,
        end_date: payload.end_date || null,
        is_active: payload.is_active ?? true
      };
      const { data, error: insertError } = await supabase.from('campaigns').insert(insertPayload).select('*').single();
      if (insertError) throw insertError;
      setCampaigns((current) => [data, ...current]);

      if (options.defaultEnabledToInitialCalls) {
        await bulkEnableInitialCalls();
      }

      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      setBusy(false);
    }
  }

  return {
    territories,
    users,
    dncRows,
    campaigns,
    loading,
    error,
    source,
    busy,
    verifyDnc,
    updateTerritory,
    updateUserRole,
    createCampaign,
    bulkEnableInitialCalls,
    reviewQueues,
    addressInventory,
    addressIndex,
    resolveReviewItem,
    accessRequests,
    approveAccessRequest,
    rejectAccessRequest,
    updateTerritoryAddresses,
    suppressAddressOnTerritory,
    markAddressManualReview,
    resolveDuplicateOwnership,
    createVerifiedDncFromReview,
    refresh: load
  };
}
