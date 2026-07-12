import type { CardEntityType } from './governance-admin';

/** Segmen rute detail per tipe card — sumber tunggal untuk `/goal/[id]` dkk. */
export const ENTITY_ROUTE_SEGMENT: Record<CardEntityType, string> = {
  goal: 'goal',
  strategy: 'strategy',
  initiative: 'initiative',
  action_plan: 'action-plan',
  task: 'task',
  development_area: 'development-area',
  problem_statement: 'problem-statement',
};
