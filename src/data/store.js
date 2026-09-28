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
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import { useAuth } from '../context/AuthContext';

const DataContext = createContext(null);

// How often the app quietly re-fetches the shared data while it's open, so
// records saved on another device (facilitator <-> admin) show up without a
// sign-out/sign-in. Not literally instant -- it's a poll -- but everything
// appears within one interval, and immediately when the app is reopened.
const POLL_INTERVAL_MS = 15000;

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

  // Bookkeeping for the background refresh below.
  const writesInFlightRef = useRef(0);
  const writeVersionRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const lastSnapshotRef = useRef(null);

  async function refresh() {
    const fresh = await apiGet('/api/db');
    lastSnapshotRef.current = JSON.stringify(fresh);
    setDb(fresh);
    return fresh;
  }

  // Wraps every write so the background refresh can tell one is happening
  // (or happened during its fetch) and not overwrite fresher local state
  // with an older server snapshot.
  async function tracked(fn) {
    writesInFlightRef.current += 1;
    writeVersionRef.current += 1;
    try {
      return await fn();
    } finally {
      writesInFlightRef.current -= 1;
      writeVersionRef.current += 1;
    }
  }

  // Background refresh: same fetch as refresh(), but quiet -- skips if a
  // save is in progress, drops the result if a save happened while it was
  // fetching, and only touches state when something actually changed.
  async function silentRefresh() {
    if (pollInFlightRef.current || writesInFlightRef.current > 0) return;
    pollInFlightRef.current = true;
    const versionAtStart = writeVersionRef.current;
    try {
      const fresh = await apiGet('/api/db');
      if (writeVersionRef.current !== versionAtStart) return;
      const snapshot = JSON.stringify(fresh);
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setDb(fresh);
      }
    } catch (e) {
      console.warn('Background refresh failed', e?.message || e);
    } finally {
      pollInFlightRef.current = false;
    }
  }

  // Keep data fresh while signed in: poll on a timer while the app is in
  // the foreground, and refresh straight away when it comes back to it.
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') silentRefresh();
    }, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') silentRefresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [currentUser?.id]);

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
      addRecord: (table, record) => tracked(async () => {
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
      }),

      updateRecord: (table, id, patch) => tracked(async () => {
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
      }),

      deleteRecord: (table, id) => tracked(async () => {
        const prevDb = db;
        setDb((prev) => ({ ...prev, [table]: prev[table].filter((r) => r.id !== id) }));
        try {
          await apiDelete(`/api/${table}/${id}`);
        } catch (e) {
          setDb(prevDb);
          throw e;
        }
      }),

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
      logOverride: (override) => tracked(async () => {
        const saved = await apiPost('/api/overrides', override);
        setDb((prev) => ({ ...prev, overrides: [saved, ...prev.overrides] }));
        return saved;
      }),

      changePassword: (resourceId, newPassword) => tracked(async () => {
        const { user } = await apiPost('/api/auth/change-password', { resourceId, newPassword });
        setDb((prev) => ({
          ...prev,
          resources: prev.resources.map((r) => (r.id === resourceId ? { ...r, ...user } : r)),
        }));
        return user;
      }),

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
