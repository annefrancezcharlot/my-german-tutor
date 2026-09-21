import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

vi.mock('../../api', () => ({
  deleteSession: vi.fn(),
  getUserSessions: vi.fn().mockResolvedValue([]),
  getErrorStats: vi.fn().mockResolvedValue([]),
  getErrorTimeline: vi.fn().mockResolvedValue([
    { date: '2026-08-01T10:00:00Z', topic: 'Old', score: 60 },
    { date: '2026-09-01T00:00:00Z', topic: 'New', score: 80 },
  ]),
  getExerciseTimeline: vi.fn().mockResolvedValue([
    { date: '2026-08-01T10:00:00Z', category: 'case', score: 60 },
    { date: '2026-09-01T00:00:00Z', category: 'case', score: 80 },
    { date: '2026-09-02T10:00:00Z', category: 'gender', score: 90 },
  ]),
  getActivityTimeline: vi.fn().mockResolvedValue([
    { date: '2026-08-01', conversations: 1 },
    { date: '2026-09-01', conversations: 2 },
  ]),
}));
vi.mock('./ProgressChart', () => ({ ProgressChart: (props: unknown) => <output data-testid="progress">{JSON.stringify(props)}</output> }));
vi.mock('./ExerciseScoreChart', () => ({ ExerciseScoreChart: (props: unknown) => <output data-testid="exercises">{JSON.stringify(props)}</output> }));
vi.mock('./ActivityChart', () => ({ ActivityChart: (props: unknown) => <output data-testid="activity">{JSON.stringify(props)}</output> }));

const props = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);

it('applies an inclusive start date to all graphs and resets to all time', async () => {
  render(<MemoryRouter><Dashboard user={{ id: 'user', username: 'Learner', level: 'B2', created_at: '' }} /></MemoryRouter>);
  await screen.findByLabelText('Show graphs from');
  fireEvent.change(screen.getByLabelText('Show graphs from'), { target: { value: '2026-09-01' } });
  expect(props('progress').timeline).toHaveLength(1);
  expect(props('exercises').entries).toHaveLength(2);
  expect(props('activity').entries).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'All time' }));
  expect(props('progress').timeline).toHaveLength(2);
  expect(props('exercises').entries).toHaveLength(3);
  expect(props('activity').entries).toHaveLength(2);
});

it('selects each graph independently and handles an empty date range', async () => {
  render(<MemoryRouter><Dashboard user={{ id: 'user', username: 'Learner', level: 'B2', created_at: '' }} /></MemoryRouter>);
  await screen.findByRole('group', { name: 'Conversation data' });
  fireEvent.click(within(screen.getByRole('group', { name: 'Conversation data' })).getByRole('button', { name: 'Score' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Exercise category' })).getByRole('button', { name: 'Gender' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Activity data' })).getByRole('button', { name: 'Card sets' }));
  expect(props('progress').series).toBe('score');
  expect(props('exercises').entries).toHaveLength(1);
  expect(props('exercises').entries[0].category).toBe('gender');
  expect(props('activity').series).toBe('flashcardSets');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group', { name: 'Conversation data' })).getByRole('button', { name: 'Score' }));
  expect(props('progress').series).toBe('all');
  fireEvent.click(within(screen.getByRole('group', { name: 'Exercise category' })).getByRole('button', { name: 'All' }));
  expect(props('exercises').entries).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Show graphs from'), { target: { value: '2027-01-01' } });
  expect(screen.getByText('No conversations in this date range')).toBeInTheDocument();
  expect(screen.getByText('No exercises for this category and date range')).toBeInTheDocument();
  expect(screen.getByText('No activity in this date range')).toBeInTheDocument();
});
