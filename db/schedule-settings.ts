import { parseWeekPlan, type DayPlan, type WeekPlan } from '@/lib/schedule';
import { getSetting, setSetting } from './settings-queries';

const KEY = 'week_plan';

export async function getWeekPlan(): Promise<WeekPlan> {
  return parseWeekPlan(await getSetting(KEY));
}

export async function setDayPlan(weekday: number, plan: DayPlan): Promise<WeekPlan> {
  const week = await getWeekPlan();
  week[weekday] = plan;
  await setSetting(KEY, JSON.stringify(week));
  return week;
}
