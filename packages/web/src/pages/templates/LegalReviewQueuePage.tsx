import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { LegalQueueItem } from "../../lib/types";

export function LegalReviewQueuePage() {
  const [items, setItems] = useState<LegalQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LegalQueueItem[]>("/templates/legal-queue")
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Legal review queue</h1>
        <p className="text-sm text-slate-500">
          {items === null
            ? " "
            : items.length === 0
              ? "Nothing waiting on you."
              : `${items.length} template${items.length === 1 ? "" : "s"} waiting on you.`}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
          No templates pending review.
        </div>
      )}

      {items && items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Fund</th>
                <th className="px-4 py-3">Sponsor</th>
                <th className="px-4 py-3">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/templates/${t.id}`} className="font-medium text-slate-900 hover:underline">
                      {t.originalFilename}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.fund.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.fund.sponsorName}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(t.uploadedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
