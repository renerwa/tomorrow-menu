import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidDateString, todayInTimeZone } from "@/domain/date";

describe("calendar date helpers", () => {
  it("rejects impossible calendar dates", () => {
    expect(isValidDateString("2026-10-29")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-1-01")).toBe(false);
  });

  it("adds days without UTC/local truncation bugs", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-30")).toBe(29);
  });

  it("computes today in the configured timezone", () => {
    const instant = new Date("2026-10-28T16:30:00.000Z");
    expect(todayInTimeZone("Asia/Shanghai", instant)).toBe("2026-10-29");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-10-28");
  });
});
