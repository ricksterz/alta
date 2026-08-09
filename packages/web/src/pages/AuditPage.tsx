import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface AuditActor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actor: AuditActor | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Facets {
  actions: { value: string; count: number }[];
  entityTypes: { value: string; count: number }[];
}

// Action names are namespaced (`subscription.signed`), so the prefix is a
// reliable grouping without maintaining a second list that would drift.
const DOMAIN_STYLES: Record<string, string> = {
  auth: "bg-slate-100 text-slate-600",
  investor: "bg-sky-50 text-sky-700",
  fund: "bg-violet-50 text-violet-700",
  template: "bg-violet-50 text-violet-700",
  subscription: "bg-emerald-50 text-emerald-700",
  capital_call: "bg-amber-50 text-amber-700",
  transfer: "bg-orange-50 text-orange-700",
  position: "bg-teal-50 text-teal-700",
};

function ActionBadge({ action }: { action: string }) {
  const domain = action.split(".")[0]!;
  const style = DOMAIN_STYLES[domain] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`whitespace-nowrap rounded px-2 py-0.5 font-mono text-xs font-medium ${style}`}>
      {action}
    </span>
  );
}

function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="text-slate-300">—</span>;
  }
  const entries = Object.entries(metadata);
  const preview = entries
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === "object" ? "…" : String(v)}`)
    .join(" · ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-left text-xs text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        {open ? "Hide" : preview}
        {!open && entries.length > 2 && ` · +${entries.length - 2}`}
      </button>
      {open && (
        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Facets>("/audit/facets").then(setFacets).catch(() => setFacets(null));
  }, []);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (action) params.set("action", action);
        if (entityType) params.set("entityType", entityType);
        if (search) params.set("search", search);
        if (from) params.set("from", new Date(from).toISOString());
        if (cursor) params.set("cursor", cursor);
        const res = await api.get<{ events: AuditEvent[]; nextCursor: string | null }>(
          `/audit?${params.toString()}`
        );
        setEvents((prev) => (cursor ? [...prev, ...res.events] : res.events));
        setNextCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load audit events");
      } finally {
        setLoading(false);
      }
    },
    [action, entityType, search, from]
  );

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const inputClass =
    "rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Audit trail</h1>
        <p className="text-sm text-slate-500">
          Every write in the system, from one source. Scoped to your firm.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          className={`${inputClass} min-w-[220px] flex-1`}
          placeholder="Search action, entity type, or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {facets?.actions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.value} ({a.count})
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        >
          <option value="">All entities</option>
          {facets?.entityTypes.map((e) => (
            <option key={e.value} value={e.value}>
              {e.value} ({e.count})
            </option>
          ))}
        </select>
        <input
          type="date"
          className={inputClass}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
        />
        {(action || entityType || search || from) && (
          <button
            type="button"
            onClick={() => {
              setAction("");
              setEntityType("");
              setSearch("");
              setFrom("");
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {events.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
          No audit events match these filters.
        </div>
      )}

      {events.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={e.action} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-800">{e.entityType}</div>
                    <div className="font-mono text-xs text-slate-400">
                      {e.entityId.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {e.actor ? (
                      <>
                        <div className="text-slate-800">
                          {e.actor.firstName} {e.actor.lastName}
                        </div>
                        <div className="text-xs text-slate-400">{e.actor.email}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">{e.actorType}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <MetadataCell metadata={e.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => load(nextCursor)}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
