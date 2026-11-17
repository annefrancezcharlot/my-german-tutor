import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { deleteUserAccount, updateUserProfile } from '../../api';
import type { User } from '../../types';
import { useI18n } from '../../i18n';
import { LanguageSwitcher } from '../Layout/LanguageSwitcher';

interface Props {
  user: User;
  onUserUpdate: (user: User) => void;
  onAccountDeleted: () => void;
}

type Level = 'B1' | 'B2' | 'C1';
type GermanVariant = 'de-DE' | 'de-CH' | 'de-AT';

const dialectLabels: Record<GermanVariant, string> = {
  'de-DE': 'Germany',
  'de-CH': 'Switzerland',
  'de-AT': 'Austria',
};

export const ProfilePage: React.FC<Props> = ({ user, onUserUpdate, onAccountDeleted }) => {
  const [level, setLevel] = useState<Level>(user.level);
  const [germanVariant, setGermanVariant] = useState<GermanVariant>(user.german_variant ?? 'de-DE');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const hasChanges = level !== user.level || germanVariant !== (user.german_variant ?? 'de-DE');
  const deleteEnabled = deleteConfirmation.trim().toLowerCase() === t('delete');

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      return typeof detail === 'string' ? detail : fallback;
    }
    return err instanceof Error ? err.message : fallback;
  };

  const handleSave = async () => {
    if (!hasChanges || saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateUserProfile({
        level,
        german_variant: germanVariant,
      });
      onUserUpdate(updated);
      setMessage(t('Profile updated.'));
    } catch (err) {
      setError(getErrorMessage(err, t('Could not update your profile.')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEnabled || deleting) return;

    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await deleteUserAccount();
      onAccountDeleted();
    } catch (err) {
      setError(getErrorMessage(err, t('Could not delete your account.')));
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('My profile')}</h1>
        <p className="mt-2 text-slate-400">{t('Manage your learning settings and account.')}</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">{t('Username')}</span>
            <input
              value={user.username}
              disabled
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-slate-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">{t('Level')}</span>
            <select
              value={level}
              onChange={event => setLevel(event.target.value as Level)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-blue-500"
            >
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">{t('Dialect')}</span>
            <select
              value={germanVariant}
              onChange={event => setGermanVariant(event.target.value as GermanVariant)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-blue-500"
            >
              {Object.entries(dialectLabels).map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </label>

          <div className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">{t('Interface language')}</span>
            <LanguageSwitcher />
            <p className="mt-1.5 text-xs text-slate-400">{t('Explanations, corrections and hints from the tutor use this language too.')}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="text-sm">
            {message && <span className="text-green-300">{message}</span>}
            {error && <span className="text-red-300">{error}</span>}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('Save changes')}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-red-900/70 bg-red-950/30 p-6">
        <h2 className="text-lg font-semibold text-red-100">{t('Delete account')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-red-200/80">
          {t('This permanently deletes your auth account and app data. Type delete to confirm.')}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={deleteConfirmation}
            onChange={event => setDeleteConfirmation(event.target.value)}
            placeholder={t('delete')}
            className="min-w-0 flex-1 rounded-lg border border-red-800 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-red-500"
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={!deleteEnabled || deleting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {t('Delete account')}
          </button>
        </div>
      </div>
    </div>
  );
};
