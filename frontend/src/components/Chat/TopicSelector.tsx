import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getFreeConversationTopics, getTopics } from '../../api';
import type { User, Topic, ConversationStarter, SelectedConversation, RecentFreeTopic } from '../../types';
import { ChevronDown, Dice5, Loader2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface Props { user: User; }

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
      'Free discussions',
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
  const savedTopicGroups = Array.from(filteredFreeConversationTopics.reduce((groups, item) => {
    const category = item.category || 'Free discussions';
    const items = groups.get(category) || [];
    items.push(item);
    groups.set(category, items);
    return groups;
  }, new Map<string, RecentFreeTopic[]>()));
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Choose a topic</h1>
          <p className="mt-2 text-sm text-slate-400">Start with your own idea or browse saved topics.</p>
        </div>
        <button
          type="button"
          onClick={handleRandomTopic}
          disabled={loading || topics.length === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting === '__random-topic__' ? <Loader2 size={16} className="animate-spin" /> : <Dice5 size={16} />}
          Random topic
        </button>
      </div>

      <form
        onSubmit={event => { event.preventDefault(); handleFreeTopicStart(); }}
        className="mb-10"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="conversation-topic"
            value={freeTopic}
            onChange={event => setFreeTopic(event.target.value)}
            placeholder="What would you like to talk about?"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!freeTopic.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquare size={16} /> Start conversation
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-3">
          <label htmlFor="topic-category" className="text-sm text-slate-400"></label>
          <select
            id="topic-category"
            value={activeCategory}
            onChange={event => { setActiveCategory(event.target.value); setExpandedTopicId(null); }}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:max-w-64"
          >
            {categories.map(category => <option key={category} value={category}>{category === 'All' ? 'All categories' : category}</option>)}
          </select>
        </div>
      </div>

      {savedTopicGroups.length === 0 && filtered.length === 0 && (
        <p className="py-8 text-sm text-slate-400">No saved prompts in this category yet. Start a conversation with your own topic above.</p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        {savedTopicGroups.map(([category, items]) => {
          const groupId = `saved-category:${category}`;
          const expanded = expandedTopicId === groupId;
          return (
            <section key={groupId} className="overflow-hidden rounded-xl bg-slate-800/70">
              <h3>
                <button
                  type="button"
                  onClick={() => setExpandedTopicId(current => current === groupId ? null : groupId)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-base font-semibold text-white">{category}</span>
                    <span className="mt-1 block text-sm font-normal text-slate-400">{items.length} saved {items.length === 1 ? 'prompt' : 'prompts'}</span>
                  </span>
                  <ChevronDown size={18} className={clsx('shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
                </button>
              </h3>
              {expanded && (
                <div className="mx-5 space-y-2 border-t border-slate-700/60 py-4">
                  {items.map(item => (
                    <button key={item.title} type="button" onClick={() => handleFreeConversationTopicStart(item)}
                      className="flex w-full items-start gap-2 rounded-lg p-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/50 hover:text-white">
                      <MessageSquare size={15} className="mt-0.5 shrink-0 text-slate-400" />
                      {cleanFreeConversationTitle(item.title)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {filtered.map(topic => {
          const expanded = expandedTopicId === topic.id;
          return (
            <section key={topic.id} className="overflow-hidden rounded-xl bg-slate-800/70">
              <h3>
                <button
                  type="button"
                  onClick={() => setExpandedTopicId(current => current === topic.id ? null : topic.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-base font-semibold text-white">{topic.title}</span>
                    <span className="mt-1 block text-sm font-normal text-slate-400">{topic.conversation_starters.length} saved {topic.conversation_starters.length === 1 ? 'prompt' : 'prompts'}</span>
                  </span>
                  <ChevronDown size={18} className={clsx('shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
                </button>
              </h3>
              {expanded && (
                <div className="mx-5 space-y-2 border-t border-slate-700/60 py-4">
                  <p className="mb-3 text-sm text-slate-400">{topic.description}</p>
                  <button
                    type="button"
                    onClick={() => handleStart(topic, pickRandomStarter(topic), `${topic.id}::random`)}
                    disabled={loading || topic.conversation_starters.length === 0}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700/50 disabled:opacity-50"
                  >
                    <Dice5 size={16} /> Random prompt
                  </button>
                  {topic.conversation_starters.map(starter => (
                    <button
                      key={starter.id}
                      type="button"
                      onClick={() => handleStart(topic, starter, `${topic.id}::${starter.id}`)}
                      disabled={loading}
                      className="flex w-full items-start gap-2 rounded-lg p-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/50 hover:text-white disabled:opacity-50"
                    >
                      <MessageSquare size={15} className="mt-0.5 shrink-0 text-slate-400" />
                      {starter.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
