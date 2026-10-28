import type { Composition, Dish, DishRole } from "./types";

const ROLE_ORDER: Record<DishRole, number> = { meat: 0, veg: 1, soup: 2, other: 3 };

export function sortDishesByRole<T extends { role: DishRole; sortOrder?: number }>(dishes: T[]): T[] {
  return [...dishes].sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return roleDiff || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export function getComposition(dishes: Array<Pick<Dish, "role">>): Composition {
  const total = dishes.length;
  const meat = dishes.filter((dish) => dish.role === "meat").length;
  const veg = dishes.filter((dish) => dish.role === "veg").length;
  const soup = dishes.filter((dish) => dish.role === "soup").length;
  const other = dishes.filter((dish) => dish.role === "other").length;
  const valid = total === 3 && meat === 2 && ((veg === 1 && soup === 0) || (veg === 0 && soup === 1));

  let label = "搭配待调整";
  if (total === 0) label = "还没有选菜";
  else if (total < 3) label = `还差 ${3 - total} 道`;
  else if (valid && veg === 1) label = "2 荤 1 素 · 共 3 道";
  else if (valid && soup === 1) label = "2 荤 1 汤 · 共 3 道";

  return { total, meat, veg, soup, other, valid, label };
}

export function compositionWarnings(dishes: Array<Pick<Dish, "role">>): string[] {
  const composition = getComposition(dishes);
  if (composition.valid) return [];
  if (composition.total > 3) return [`当前 ${composition.total} 道，一桌只能有 3 道菜。`];
  if (composition.total < 3) return [`当前 ${composition.total} 道，还差 ${3 - composition.total} 道。`];
  return [
    `当前 ${composition.total} 道：${composition.meat} 荤、${composition.veg} 素、${composition.soup} 汤。需要恰好两荤加一道素菜或汤。`
  ];
}
