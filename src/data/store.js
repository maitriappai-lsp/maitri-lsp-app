// ---------------------------------------------------------------------------
// DataProvider: now backed by the real Node/Express + PostgreSQL API in
// ../../backend (Section 6), instead of the AsyncStorage mock.
//
// Screens don't change: they still call db, addRecord, updateRecord,
// deleteRecord, nextId, logOverride, changePassword, and the getX lookups
// exactly as before. Under the hood, each write now does an optimistic
// local update (so the UI stays snappy) followed by the matching API call;
// if the API call fails, the local change is rolled back and the error is
// re-thrown so the calling screen's existing try/catch or .catch() can
// surface it.
// ---------------------------------------------------------------------------
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import { useAuth } from '../context/AuthContext';

const DataContext = createContext(null);

const EMPTY_DB = {
  resources: [],
  beneficiaries: [],
  categories: [],
  geo: [],
  schedule: [],
  psr: [],
  attendance: [],
  overrides: [],
  uploads: [],
  content: [],
  systemParameters: null,
};

function nextId(prefix, list) {
  const n = list.length + 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function DataProvider({ children }) {
  // Every endpoint except /api/auth/* requires a bearer token, so there's
  // nothing to load until someone is signed in. We fetch once currentUser
  // appears (right after login or on a restored session) and reset back to
  // empty on logout.
  const { currentUser } = useAuth();
  const [db, setDb] = useState(EMPTY_DB);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  async function refresh() {
    const fresh = await apiGet('/api/db');
    setDb(fresh);
    return fresh;
  }

  useEffect(() => {
    if (!currentUser) {
      setDb(EMPTY_DB);
      setLoaded(false);
      return;
    }
    (async () => {
      try {
        await refresh();
      } catch (e) {
        console.warn('Failed to load data from backend', e);
        setError(e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [currentUser?.id]);

  const api = useMemo(
    () => ({
      db,
      loaded,
      error,
      refresh,

      // ---- generic master helpers -------------------------------------
      // Optimistic: update local state immediately, persist to the API,
      // roll back on failure.
      addRecord: async (table, record) => {
        const prevDb = db;
        setDb((prev) => ({ ...prev, [table]: [...prev[table], record] }));
        try {
          const saved = await apiPost(`/api/${table}`, record);
          setDb((prev) => ({
            ...prev,
            [table]: prev[table].map((r) => (r.id === record.id ? saved : r)),
          }));
          return saved;
        } catch (e) {
          setDb(prevDb);
          throw e;
        }
      },

      updateRecord: async (table, id, patch) => {
        const prevDb = db;
        setDb((prev) => ({
          ...prev,
          [table]: prev[table].map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        try {
          const saved = await apiPatch(`/api/${table}/${id}`, patch);
          setDb((prev) => ({
            ...prev,
            [table]: prev[table].map((r) => (r.id === id ? saved : r)),
          }));
          return saved;
        } catch (e) {
          setDb(prevDb);
          throw e;
        }
      },

      deleteRecord: async (table, id) => {
        const prevDb = db;
        setDb((prev) => ({ ...prev, [table]: prev[table].filter((r) => r.id !== id) }));
        try {
          await apiDelete(`/api/${table}/${id}`);
        } catch (e) {
          setDb(prevDb);
          throw e;
        }
      },

      nextId: (prefix, table) => nextId(prefix, db[table]),

      // Generates `count` sequential ids at once, e.g. for the Schedule
      // screen's recurring-session builder, which saves many records from
      // one confirm tap. Calling nextId() in a loop would hand out the same
      // id to every record, since db[table] doesn't grow until each save's
      // response comes back -- this reserves a distinct id for each one
      // upfront instead.
      nextIds: (prefix, table, count) => {
        const start = db[table].length;
        return Array.from({ length: count }, (_, i) => `${prefix}-${String(start + i + 1).padStart(4, '0')}`);
      },

      // ---- domain-specific helpers --------------------------------------
      // Overrides get their id + timestamp from the server (an audit log
      // can't trust the client's clock), so this isn't optimistic -- it
      // waits for the server's response before adding to local state.
      logOverride: async (override) => {
        const saved = await apiPost('/api/overrides', override);
        setDb((prev) => ({ ...prev, overrides: [saved, ...prev.overrides] }));
        return saved;
      },

      changePassword: async (resourceId, newPassword) => {
        const { user } = await apiPost('/api/auth/change-password', { resourceId, newPassword });
        setDb((prev) => ({
          ...prev,
          resources: prev.resources.map((r) => (r.id === resourceId ? { ...r, ...user } : r)),
        }));
        return user;
      },

      // ---- lookups (unchanged -- local array finds against the cached db) --
      getBeneficiary: (id) => db.beneficiaries.find((b) => b.id === id),
      getCategory: (id) => db.categories.find((c) => c.id === id),
      getResource: (id) => db.resources.find((r) => r.id === id),
      getGeoForSchool: (school) => db.geo.find((g) => g.school === school),
      getGeo: (id) => db.geo.find((g) => g.id === id),
    }),
    [db, loaded, error]
  );

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
