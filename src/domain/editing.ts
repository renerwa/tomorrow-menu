export function pickRandomReplacement<T extends { id: string }>(
  candidates: T[],
  menuDishIds: Iterable<string>,
  currentDishId: string,
  random: () => number = Math.random
): T | null {
  const excluded = new Set(menuDishIds);
  excluded.delete(currentDishId);
  const pool = candidates.filter((dish) => dish.id !== currentDishId && !excluded.has(dish.id));
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}
