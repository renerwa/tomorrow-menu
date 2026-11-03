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

export function filterPickerDishes<T extends { id: string; name: string; normalizedName: string; role: string }>(
  dishes: T[],
  options: { query: string; role: string; menuDishIds: Iterable<string> }
): T[] {
  const query = options.query.trim();
  const normalizedQuery = query.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const menuDishIds = new Set(options.menuDishIds);
  return dishes.filter((dish) => {
    if (menuDishIds.has(dish.id)) return false;
    if (!normalizedQuery) return dish.role === options.role;
    return dish.name.includes(query) || dish.normalizedName.toLowerCase().includes(normalizedQuery);
  });
}
