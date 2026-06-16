import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink, FileText, Headphones, HelpCircle, MessageSquare, PlaySquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getResources } from '../../api';
import type { LearningResource, ResourceType, User } from '../../types';

interface Props {
  user: User;
}

const resourceIcons: Record<ResourceType, React.ReactNode> = {
  video: <PlaySquare size={18} />,
  text: <FileText size={18} />,
  audio: <Headphones size={18} />,
};

const resourceLabels: Record<ResourceType, string> = {
  video: 'Video',
  text: 'Text',
  audio: 'Audio',
};

export const ResourcesPage: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ResourceType | 'all'>('all');
  const [activeTopic, setActiveTopic] = useState<string>('all');

  useEffect(() => {
    const loadResources = async () => {
      setLoading(true);
      setError(null);
      try {
        setResources(await getResources());
      } catch {
        setError('Resources could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    loadResources();
  }, []);

  const topics = useMemo(
    () => Array.from(new Set(resources.map(item => item.topic))).sort(),
    [resources],
  );

  const filteredResources = resources.filter(resource => {
    const typeMatches = activeType === 'all' || resource.type === activeType;
    const topicMatches = activeTopic === 'all' || resource.topic === activeTopic;
    return typeMatches && topicMatches;
  });

  const handleDiscuss = (resource: LearningResource) => {
    navigate('/topics', {
      state: {
        freeTopic: resource.title,
        freeTopicDescription: `Resource: ${resource.source} · ${resource.topic} · ${resource.description}`,
      },
    });
  };

  if (loading) {
    return <div className="text-slate-300">Loading resources...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Resources</h1>
        <p className="text-slate-400 text-sm">
          Videos, texts, and audio sources for learning, with optional Claude questions.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['all', 'video', 'text', 'audio'] as Array<ResourceType | 'all'>).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                activeType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white'
              )}
            >
              {type === 'all' ? <HelpCircle size={18} /> : resourceIcons[type]}
              {type === 'all' ? 'All' : resourceLabels[type]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTopic('all')}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              activeTopic === 'all'
                ? 'bg-orange-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white'
            )}
          >
            All topics
          </button>
          {topics.map(topic => (
            <button
              key={topic}
              type="button"
              onClick={() => setActiveTopic(topic)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                activeTopic === topic
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white'
              )}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filteredResources.map(resource => {
          return (
            <div key={resource.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-900/40 px-2.5 py-1 text-xs font-semibold text-blue-200">
                      {resourceIcons[resource.type]}
                      {resourceLabels[resource.type]}
                    </span>
                    <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                      {resource.topic} · {resource.level}
                    </span>
                    <span className="text-xs text-slate-500">{resource.source}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white">{resource.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{resource.description}</p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-blue-500 hover:text-white"
                  >
                    Open
                    <ExternalLink size={15} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDiscuss(resource)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                  >
                    Discuss
                    <MessageSquare size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Focus
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(resource.focus ?? []).map(item => (
                      <span key={item} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vocabulary
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(resource.vocabulary ?? []).map(item => (
                      <span key={item} className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs text-orange-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {resource.excerpt && (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-relaxed text-slate-300">
                  {resource.excerpt}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
};
