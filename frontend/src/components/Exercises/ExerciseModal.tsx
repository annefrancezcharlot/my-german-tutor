import React, { useEffect, useState } from 'react';
import type { Exercise, ExerciseResult } from '../../types';
import { submitExercise } from '../../api';
import { FillBlankExercise } from './types/FillBlankExercise';
import { CorrectionExercise } from './types/CorrectionExercise';
import { MultipleChoiceExercise } from './types/MultipleChoiceExercise';
import { TranslationExercise } from './types/TranslationExercise';
import { VocabularyClozeExercise } from './types/VocabularyClozeExercise';
import { GenderChoiceExercise } from './types/GenderChoiceExercise';
import { ResultView } from './ResultView';
import { CheckCircle2, Loader2, RotateCcw, X, XCircle, AlertCircle } from 'lucide-react';
import { ERROR_CATEGORY_LABELS } from '../../types';

interface Props {
  exercise: Exercise;
  userId: string;
  onClose: () => void;
  onCompleted: (updated: Exercise) => void;
}

export const ExerciseModal: React.FC<Props> = ({
  exercise, onClose, onCompleted,
}) => {
  const initialAttempts = exercise.attempts ?? [];
  const latestAttempt = initialAttempts[initialAttempts.length - 1];
  const savedResult: ExerciseResult | null =
    latestAttempt && exercise.correct_answers
      ? {
          score: latestAttempt.score,
          feedback: latestAttempt.feedback,
          correct_answers: exercise.correct_answers,
          item_results: latestAttempt.item_results ?? [],
          attempt_number: latestAttempt.attempt_number,
        }
      : null;
  const [answers, setAnswers] = useState<Record<string, string>>(
    latestAttempt?.submitted_answers ?? {},
  );
  const [result, setResult] = useState<ExerciseResult | null>(savedResult);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [redoing, setRedoing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGenderChoice = exercise.exercise_type === 'multiple_choice' && !!exercise.content.items?.length;
  const genderItemCount = exercise.content.items?.length ?? 0;

  const handleSubmit = async () => {
    if (Object.keys(answers).length === 0) {
      setError('Please answer at least one question.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await submitExercise(exercise.id, answers);
      const nextAttempt = {
        id: null,
        attempt_number: res.attempt_number ?? attempts.length + 1,
        submitted_answers: answers,
        feedback: res.feedback,
        item_results: res.item_results ?? [],
        score: res.score,
        created_at: new Date().toISOString(),
      };
      setAttempts(prev => [...prev, nextAttempt]);
      setResult(res);
      setRedoing(false);
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isGenderChoice || result || submitting || genderItemCount === 0) return;
    const answeredCount = exercise.content.items?.filter(item => answers[String(item.id)]).length ?? 0;
    if (answeredCount === genderItemCount) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, genderItemCount, isGenderChoice, result, submitting]);

  const handleClose = () => {
    if (result) {
      const nextAttempts = attempts.length > 0
        ? attempts
        : [{
            id: null,
            attempt_number: result.attempt_number ?? 1,
            submitted_answers: answers,
            feedback: result.feedback,
            item_results: result.item_results ?? [],
            score: result.score,
            created_at: new Date().toISOString(),
          }];
      const summaryAttempt = nextAttempts[nextAttempts.length - 1];
      const summaryScore = summaryAttempt?.score ?? result.score;

      onCompleted({
        ...exercise,
        completed: true,
        score: summaryScore,
        correct_answers: result.correct_answers,
        attempts: nextAttempts,
      });
    }
    onClose();
  };

  const handleRedo = () => {
    setAnswers({});
    setResult(null);
    setRedoing(true);
    setError(null);
  };

  const handleSelectAttempt = (attemptNumber: number) => {
    const attempt = attempts.find(item => item.attempt_number === attemptNumber);
    if (!attempt || !exercise.correct_answers) return;

    setAnswers(attempt.submitted_answers);
    setResult({
      score: attempt.score,
      feedback: attempt.feedback,
      correct_answers: exercise.correct_answers,
      item_results: attempt.item_results ?? [],
      attempt_number: attempt.attempt_number,
    });
    setRedoing(false);
    setError(null);
  };

  const renderExercise = () => {
    const props = {
      content: exercise.content,
      answers,
      onChange: (id: string, value: string) =>
        setAnswers(prev => ({ ...prev, [id]: value })),
      disabled: !!result,
    };

    if (isGenderChoice) {
      return <GenderChoiceExercise {...props} correctAnswers={exercise.correct_answers} />;
    }

    switch (exercise.exercise_type) {
      case 'fill_blank': return <FillBlankExercise {...props} />;
      case 'correction': return <CorrectionExercise {...props} />;
      case 'multiple_choice': return <MultipleChoiceExercise {...props} />;
      case 'translation': return <TranslationExercise {...props} />;
      case 'vocabulary_cloze': return (
        <VocabularyClozeExercise {...props} correctAnswers={exercise.correct_answers} />
      );
      default: return <div className="text-slate-400">Unknown exercise type.</div>;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-slate-700 shrink-0">
          <div>
            <div className="text-xs text-slate-400 mb-1">
              {ERROR_CATEGORY_LABELS[exercise.error_category] || exercise.error_category}
              {' · '}{exercise.difficulty}
            </div>
            <h2 className="font-bold text-white text-lg leading-tight">
              {exercise.title}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{exercise.instructions}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors shrink-0 ml-4 p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5" data-exercise-scroll-container>
          {attempts.length > 0 && (
            <AttemptProgress
              attempts={attempts}
              activeAttemptNumber={result?.attempt_number ?? null}
              onSelectAttempt={handleSelectAttempt}
            />
          )}

          {result && isGenderChoice ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
                <div className="text-sm font-semibold text-slate-300">Score</div>
                <div className="mt-1 text-4xl font-bold text-white">{Math.round(result.score)}%</div>
              </div>
              <GenderChoiceExercise
                content={exercise.content}
                answers={answers}
                correctAnswers={result.correct_answers}
                onChange={() => undefined}
                disabled
              />
            </div>
          ) : result ? (
            <ResultView
              result={result}
              exerciseType={exercise.exercise_type}
              answers={answers}
              content={exercise.content}
            />
          ) : exercise.completed && !redoing ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-300">
              Your answers were not stored for this older completed exercise.
              You can redo it; from now on, all attempts will be saved.
            </div>
          ) : (
            renderExercise()
          )}
        </div>

        <div className="border-t border-slate-700 p-4 shrink-0 flex items-center justify-between gap-3">
          {error && (
            <span className="text-red-400 text-xs flex-1">{error}</span>
          )}
          {isGenderChoice && submitting && !result && (
            <span className="text-slate-400 text-xs flex-1">Saving results...</span>
          )}
          <div className="flex gap-3 ml-auto">
            {(result || exercise.completed) && (
              <button
                onClick={handleRedo}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 transition-colors flex items-center gap-2"
              >
                <RotateCcw size={14} />
                Practice again
              </button>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 transition-colors"
            >
              {result ? 'Close' : 'Cancel'}
            </button>

            {!isGenderChoice && !result && (!exercise.completed || redoing) && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AttemptProgress: React.FC<{
  attempts: NonNullable<Exercise['attempts']>;
  activeAttemptNumber: number | null;
  onSelectAttempt: (attemptNumber: number) => void;
}> = ({ attempts, activeAttemptNumber, onSelectAttempt }) => (
  <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
      Progress
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {attempts.map(attempt => {
        const active = activeAttemptNumber === attempt.attempt_number;
        const itemResults = attempt.item_results ?? [];

        return (
          <button
            key={attempt.attempt_number}
            type="button"
            onClick={() => onSelectAttempt(attempt.attempt_number)}
            className={[
              'rounded-xl border px-3 py-3 text-left transition-colors',
              active
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-700 bg-slate-800 hover:border-slate-500',
            ].join(' ')}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-white">
                Attempt {attempt.attempt_number}
              </span>
              <span className={scoreClassName(attempt.score)}>
                {Math.round(attempt.score)}%
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {itemResults.length > 0 ? itemResults.map(item => (
                <span
                  key={item.item_id}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    item.status === 'correct'
                      ? 'bg-green-500/15 text-green-200'
                      : item.status === 'partial'
                      ? 'bg-yellow-500/15 text-yellow-200'
                      : 'bg-red-500/15 text-red-200',
                  ].join(' ')}
                >
                  {item.status === 'correct'
                    ? <CheckCircle2 size={11} />
                    : item.status === 'partial'
                    ? <AlertCircle size={11} />
                    : <XCircle size={11} />}
                  {item.item_id}
                </span>
              )) : (
                <span className="text-xs text-slate-500">
                  No item-level score saved
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

const scoreClassName = (score: number) => [
  'text-sm font-bold',
  score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400',
].join(' ');
