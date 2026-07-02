export const PROTOTYPE_QUERY_PARAM = 'prototype';

export function getPrototypeMode(): boolean {
  return process.env.EXPO_PUBLIC_UI_MODE === 'prototype';
}
