import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getFreeConversationTopics, getTopics } from '../../api';
import type { User, Topic, ConversationStarter, SelectedConversation, RecentFreeTopic } from '../../types';
import { ChevronDown, Dice5, Loader2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface Props { user: User; }

const CATEGORY_COLORS: Record<string, string> = {
  Society: 'border-blue-500 bg-blue-500/10',
  Culture:  'border-purple-500 bg-purple-500/10',
  Science:  'border-green-500 bg-green-500/10',
  Lifestyle:'border-orange-500 bg-orange-500/10',
  'Free discussions': 'border-cyan-500 bg-cyan-500/10',
};

const cleanFreeConversationTitle = (title: string) => {
  const suffixPattern = /\s*:\s*(?:Free topic|Freies Thema)\.\s*(?:Let's talk about this topic|Lass uns ueber dieses Thema sprechen):\s*.*$/i;
  const prefixPattern = /^(?:Free topic|Freies Thema)\.\s*(?:Let's talk about this topic|Lass uns ueber dieses Thema sprechen):\s*/i;
  const cleaned = title.replace(suffixPattern, '').replace(prefixPattern, '').trim();
  return cleaned || title.trim();
};

export const TopicSelector: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as { freeTopic?: string; freeTopicDescription?: string } | null) ?? {};
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [freeTopic, setFreeTopic] = useState(routeState.freeTopic ?? '');
  const [freeConversationTopics, setFreeConversationTopics] = useState<RecentFreeTopic[]>([]);

  useEffect(() => {
    getTopics().then(setTopics);
  }, []);

  useEffect(() => {
    getFreeConversationTopics()
      .then(setFreeConversationTopics)
      .catch(() => setFreeConversationTopics([]));
  }, [user.id]);

  useEffect(() => {
    if (routeState.freeTopic) {
      setFreeTopic(routeState.freeTopic);
    }
  }, [routeState.freeTopic]);

  const categories = [
    'All',
    ...Array.from(new Set([
      ...topics.map(t => t.category),
      ...freeConversationTopics.map(item => item.category || 'Free discussions'),
    ])),
  ];
  const filtered = activeCategory === 'All'
    ? topics
    : topics.filter(t => t.category === activeCategory);
  const filteredFreeConversationTopics = activeCategory === 'All'
    ? freeConversationTopics
    : freeConversationTopics.filter(item => (item.category || 'Free discussions') === activeCategory);
  const groupedFreeDiscussions = filteredFreeConversationTopics.filter(
    item => !item.category || item.category === 'Free discussions',
  );
  const categorizedFreeTopics = filteredFreeConversationTopics.filter(
    item => item.category && item.category !== 'Free discussions',
  );
  const buildSelection = (topic: Topic, starter: ConversationStarter): SelectedConversation => ({
    topicId: topic.id,
    title: topic.title,
    category: topic.category,
    description: topic.description,
    starterId: starter.id,
    starterTitle: starter.title,
    starterPrompt: starter.prompt,
  });

  const pickRandomStarter = (topic: Topic): ConversationStarter => {
    const starters = topic.conversation_starters;
    return starters[Math.floor(Math.random() * starters.length)];
  };

  const handleStart = async (topic: Topic, starter: ConversationStarter, startKey: string) => {
    setStarting(startKey);
    setLoading(true);
    try {
      navigate('/chat', { state: { topic: buildSelection(topic, starter) } });
    } finally {
      setLoading(false);
      setStarting(null);
    }
  };

  const handleRandomTopic = async () => {
    if (!topics.length) return;
    const topic = topics[Math.floor(Math.random() * topics.length)];
    await handleStart(topic, pickRandomStarter(topic), '__random-topic__');
  };

  const buildFreeTopicSelection = (
    title: string,
    description = 'Free conversation topic',
    category = 'Free discussions',
  ): SelectedConversation => ({
    topicId: 'free-topic',
    title,
    category,
    description,
    starterId: 'free-topic',
    starterTitle: 'Free topic',
    starterPrompt: `Let's talk about this topic: ${title}`,
    isFreeTopic: true,
  });

  const handleFreeTopicStart = () => {
    const title = freeTopic.trim();
    if (!title) return;

    navigate('/chat', {
      state: {
        topic: buildFreeTopicSelection(
          title,
          routeState.freeTopicDescription || 'Free conversation topic',
        ),
      },
    });
  };

  const handleFreeConversationTopicStart = (item: RecentFreeTopic) => {
    const title = cleanFreeConversationTitle(item.title);
    navigate('/chat', {
      state: {
        topic: buildFreeTopicSelection(title, item.description, item.category || 'Free discussions'),
      },
    });
  };

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Choose a topic</h1>
          <p className="text-slate-400">Choose a topic, start from a specific prompt, or get a random one.</p>
        </div>
        <button
          onClick={handleRandomTopic}
          disabled={loading || topics.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting === '__random-topic__' ? (
            <><Loader2 size={16} className="animate-spin" /> Starting random topic...</>
          ) : (
            <><Dice5 size={16} /> Random topic</>
          )}
        </button>
      </div>

      <div className="mb-8 rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-white">Your own topic</h2>
          <p className="mt-1 text-sm text-slate-400">
            Start a free conversation. You can choose the category when saving.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={freeTopic}
            onChange={event => setFreeTopic(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleFreeTopicStart();
              }
            }}
            placeholder="What would you like to talk about?"
            className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleFreeTopicStart}
            disabled={!freeTopic.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquare size={16} />
            Start conversation
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={clsx(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Topic grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupedFreeDiscussions.length > 0 && (
          <div
            className={clsx(
              'rounded-xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30',
              CATEGORY_COLORS['Free discussions'],
            )}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Free discussions
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">Free conversation</h3>
            <p className="mb-4 text-sm text-slate-400">
              Restart a conversation that was saved without a specific category.
            </p>
            <button
              type="button"
              onClick={() => setExpandedTopicId(current => current === 'free-conversation' ? null : 'free-conversation')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900/60"
            >
              <ChevronDown
                size={16}
                className={clsx('transition-transform', expandedTopicId === 'free-conversation' && 'rotate-180')}
              />
              Show free topics
            </button>
            {expandedTopicId === 'free-conversation' && (
              <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                {groupedFreeDiscussions.map(item => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleFreeConversationTopicStart(item)}
                    className="block w-full rounded-lg border border-white/10 bg-slate-900/40 p-3 text-left transition-colors hover:bg-slate-900/60"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <MessageSquare size={15} className="text-cyan-300" />
                      {cleanFreeConversationTitle(item.title)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {categorizedFreeTopics.map(item => (
          <div
            key={item.title}
            className={clsx(
              'rounded-xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30',
              CATEGORY_COLORS[item.category] || CATEGORY_COLORS['Free discussions']
            )}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              {item.category || 'Free discussions'}
            </div>
            <h3 className="font-bold text-white text-lg mb-2">{cleanFreeConversationTitle(item.title)}</h3>
            <p className="text-sm text-slate-400 mb-4">
              {item.description || 'Your saved free conversation topic.'}
            </p>
            <button
              type="button"
              onClick={() => handleFreeConversationTopicStart(item)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <MessageSquare size={16} />
              Start conversation
            </button>
          </div>
        ))}

        {filtered.map(topic => (
          <div
            key={topic.id}
            className={clsx(
              'rounded-xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30',
              CATEGORY_COLORS[topic.category] || 'border-slate-600 bg-slate-800'
            )}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              {topic.category}
            </div>
            <h3 className="font-bold text-white text-lg mb-2">{topic.title}</h3>
            <p className="text-sm text-slate-400 mb-4">{topic.description}</p>
            <div className="space-y-2">
              <button
                onClick={() => handleStart(topic, pickRandomStarter(topic), `${topic.id}::random`)}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {starting === `${topic.id}::random` ? (
                  <><Loader2 size={16} className="animate-spin" /> Starting...</>
                ) : (
                  <><Dice5 size={16} /> Random prompt</>
                )}
              </button>
              <button
                onClick={() => setExpandedTopicId(current => current === topic.id ? null : topic.id)}
                className="w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900/60 flex items-center justify-center gap-2"
              >
                <ChevronDown
                  size={16}
                  className={clsx('transition-transform', expandedTopicId === topic.id && 'rotate-180')}
                />
                Choose specific prompt
              </button>
            </div>

            {expandedTopicId === topic.id && (
              <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                {topic.conversation_starters.map(starter => (
                  <button
                    key={starter.id}
                    onClick={() => handleStart(topic, starter, `${topic.id}::${starter.id}`)}
                    disabled={loading}
                    className="block w-full rounded-lg border border-white/10 bg-slate-900/40 p-3 text-left transition-colors hover:bg-slate-900/60 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                      <MessageSquare size={15} className="text-blue-300" />
                      {starter.title}
                    </div>
                    {starting === `${topic.id}::${starter.id}` && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-blue-200">
                        <Loader2 size={14} className="animate-spin" />
                        Preparing conversation...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
