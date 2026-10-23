import React, { useState } from 'react';
import { MemoryItem } from '../types/companion';
import { getAuthToken } from '../lib/firebase';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Bookmark,
  Sparkles,
  Tag,
  Clock,
  X,
  CheckCircle2,
  Database,
} from 'lucide-react';

interface MemoryVaultProps {
  memories: MemoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const MemoryVault: React.FC<MemoryVaultProps> = ({
  memories,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newSummary, setNewSummary] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>('general');
  const [newDetail, setNewDetail] = useState('');
  const [newTags, setNewTags] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = ['all', 'project', 'preference', 'technical', 'bug', 'personal', 'general'];

  const filteredMemories = memories.filter((m) => {
    if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      m.summary.toLowerCase().includes(query) ||
      (m.detail && m.detail.toLowerCase().includes(query)) ||
      (m.tags && m.tags.some((t) => t.toLowerCase().includes(query)))
    );
  });

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSummary.trim()) return;

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: newCategory,
          summary: newSummary.trim(),
          detail: newDetail.trim(),
          tags: newTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (res.ok) {
        setNewSummary('');
        setNewDetail('');
        setNewTags('');
        setIsAdding(false);
        setStatusNotice('Memory added to long-term vault.');
        setTimeout(() => setStatusNotice(null), 3000);
        onRefresh();
      } else {
        const result = await res.json().catch(() => ({}));
        setStatusNotice(result.error || 'Could not save this memory.');
      }
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'project':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'preference':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'technical':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'bug':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'personal':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                Episodic Memory Vault
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                  {memories.length} saved
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                  <Database className="w-3 h-3 text-emerald-400" />
                  Firestore Synced
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Your AI companion silently records and naturally recalls facts, preferences, and tasks stored in your cloud database.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/50 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search memories, tags, or topics..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950/70 border border-zinc-700/60 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/60"
              />
            </div>

            <button
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all active:scale-95 shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAdding ? 'Cancel' : 'Add Memory'}</span>
            </button>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`capitalize px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Memory Tip */}
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[11px]">
              <strong>Spoken Memory:</strong> Just say <code className="bg-purple-900/50 px-1 py-0.5 rounded text-purple-300 font-mono">"Remember that..."</code> during live talk, and the agent automatically stores it in Firestore!
            </span>
          </div>
        </div>

        {/* Status notice toast */}
        {statusNotice && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Add Memory Drawer Form */}
        {isAdding && (
          <form onSubmit={handleAddMemory} className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">Add New Memory Manually</span>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 capitalize focus:outline-none"
              >
                {categories
                  .filter((c) => c !== 'all')
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>

            <input
              type="text"
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              placeholder="Concise 1-sentence summary (e.g., Working on Next.js auth bug)"
              required
              className="px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/60"
            />

            <textarea
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              placeholder="Additional background context, error payloads, or technical details..."
              rows={2}
              className="px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/60 resize-none"
            />

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Comma separated tags: react, oauth, bugs"
                className="flex-1 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Memories List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 gap-2">
              <Sparkles className="w-8 h-8 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No memories found</p>
              <p className="text-xs max-w-sm">
                As you speak with Nova and share your ongoing tasks, tech stack, or preferences, Nova will quietly store memories here.
              </p>
            </div>
          ) : (
            filteredMemories.map((mem) => (
              <div
                key={mem.id}
                className="group relative p-3.5 rounded-xl bg-zinc-950/40 hover:bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold border ${getCategoryColor(mem.category)}`}>
                      {mem.category}
                    </span>
                    {mem.pinned && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400">
                        <Bookmark className="w-3 h-3 fill-amber-400" />
                        Pinned
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteMemory(mem.id)}
                    title="Remove memory"
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs text-zinc-200 font-medium leading-relaxed">{mem.summary}</p>

                {mem.detail && (
                  <p className="text-[11px] text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/50 leading-normal">
                    {mem.detail}
                  </p>
                )}

                <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {mem.tags && mem.tags.length > 0 && (
                      <>
                        <Tag className="w-2.5 h-2.5 text-zinc-600" />
                        {mem.tags.map((tag) => (
                          <span key={tag} className="text-zinc-400">
                            #{tag}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(mem.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-500">
          <span>Memories are seamlessly supplied to Nova at the start of each session.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
