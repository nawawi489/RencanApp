import type { CardEntityType } from './governance-admin';

/** Segmen rute detail per tipe card — sumber tunggal untuk `/goal/[id]` dkk. */
export const ENTITY_ROUTE_SEGMENT: Record<CardEntityType, string> = {
  goal: 'goal',
  strategy: 'kpi-area',
  strategy: 'strategy',
  initiative: 'initiative',
  task: 'action-plan',
  development_area: 'development-area',
  problem_statement: 'problem-statement',
};
